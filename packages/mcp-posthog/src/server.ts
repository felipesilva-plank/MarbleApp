import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { PostHogError, quote, runHogQL } from './posthog.js'
import type { Fetch, PostHogConfig } from './posthog.js'

/**
 * MCP server over PostHog, aimed at one workflow: walk a flow in the app, then ask whether the
 * events you expected actually fired.
 *
 * That question is worth a tool because the failure is silent. Instrumentation that was never
 * added, or was added with a typo'd name, looks exactly like a feature nobody uses - and you find
 * out six weeks later when a funnel is empty.
 */

/**
 * The catalog from apps/web/src/lib/analytics/events.ts, duplicated on purpose: this package must
 * be importable without pulling a browser workspace into a Node process. The `coverage` tool's
 * whole job is to diff this list against what has fired, so a drift between the two shows up as a
 * finding rather than hiding.
 */
export const DECLARED_EVENTS = [
  'piece_created',
  'piece_parent_assigned',
  'piece_deleted',
  'piece_list_filtered',
  'preset_saved',
  'preset_applied',
  'piece_searched',
  'backup_exported',
  'backup_imported',
  'pieces_exported_csv',
  'storage_quota_hit',
] as const

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) }
}

function errorResult(error: unknown) {
  if (error instanceof PostHogError) return textResult(error.message, true)
  return textResult(error instanceof Error ? error.message : String(error), true)
}

export function createServer(config: PostHogConfig, doFetch: Fetch = fetch): McpServer {
  const server = new McpServer({ name: 'marble-posthog', version: '0.1.0' })
  const run = (query: string) => runHogQL(config, query, doFetch)

  server.registerTool(
    'get-events',
    {
      title: 'Recent events',
      description:
        'Recent analytics events, newest first, optionally filtered by name. Returns the ' +
        'timestamp, event name, distinct id and properties. Use this to inspect what a flow ' +
        'actually emitted after walking through it.',
      inputSchema: {
        event: z.string().optional().describe('Exact event name, e.g. "piece_created".'),
        minutes: z.number().int().positive().max(10080).optional().describe('Lookback. Default 60.'),
        limit: z.number().int().positive().max(200).optional().describe('Default 50.'),
      },
    },
    async ({ event, minutes, limit }) => {
      try {
        const where = [
          `timestamp > now() - INTERVAL ${minutes ?? 60} MINUTE`,
          event ? `event = ${quote(event)}` : null,
        ]
          .filter(Boolean)
          .join(' AND ')

        const rows = await run(
          `SELECT timestamp, event, distinct_id, properties
           FROM events WHERE ${where}
           ORDER BY timestamp DESC LIMIT ${limit ?? 50}`,
        )

        if (rows.length === 0) {
          return textResult(
            `No events in the last ${minutes ?? 60} minutes${event ? ` named "${event}"` : ''}. ` +
              `PostHog ingestion lags by up to a minute or two - if you just walked the flow, wait ` +
              `and retry before concluding the instrumentation is missing.`,
          )
        }

        return textResult(JSON.stringify(rows, null, 2))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'get-event-definitions',
    {
      title: 'Event definitions',
      description:
        'Every event name PostHog has ever seen for this project, with its volume and the ' +
        'property keys observed on it. Use this to spot a name that drifted - "pieceCreated" ' +
        'sitting next to "piece_created" is the classic one.',
      inputSchema: {
        days: z.number().int().positive().max(365).optional().describe('Lookback in days. Default 30.'),
      },
    },
    async ({ days }) => {
      try {
        const rows = await run(
          `SELECT event, count() AS volume, max(timestamp) AS last_seen,
                  arrayDistinct(arrayFlatten(groupArray(JSONExtractKeys(properties)))) AS property_keys
           FROM events
           WHERE timestamp > now() - INTERVAL ${days ?? 30} DAY
           GROUP BY event ORDER BY volume DESC`,
        )
        return textResult(JSON.stringify(rows, null, 2))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'check-event-fired',
    {
      title: 'Did this event fire?',
      description:
        'Answer yes or no for one event in the last N minutes, with the count and the most ' +
        'recent occurrence. This is the tool to call right after walking a flow in the app.',
      inputSchema: {
        event: z.string().describe('Exact event name.'),
        minutes: z.number().int().positive().max(1440).optional().describe('Default 10.'),
      },
    },
    async ({ event, minutes }) => {
      const window = minutes ?? 10
      try {
        const [row] = await run(
          `SELECT count() AS occurrences, max(timestamp) AS last_seen
           FROM events
           WHERE event = ${quote(event)} AND timestamp > now() - INTERVAL ${window} MINUTE`,
        )

        const occurrences = Number(row?.occurrences ?? 0)

        if (occurrences === 0) {
          const declared = (DECLARED_EVENTS as readonly string[]).includes(event)
          return textResult(
            `NO - "${event}" has not fired in the last ${window} minutes.\n\n` +
              (declared
                ? 'It is declared in the app catalog, so either the flow was not reached, the ' +
                  'capture call is missing at that call site, or ingestion has not caught up yet ' +
                  '(allow a minute or two).'
                : `It is NOT in the declared catalog (${DECLARED_EVENTS.join(', ')}). Check the ` +
                  `spelling before assuming it is missing.`),
          )
        }

        return textResult(
          `YES - "${event}" fired ${occurrences} time${occurrences === 1 ? '' : 's'} in the last ` +
            `${window} minutes. Most recent: ${String(row?.last_seen)}.`,
        )
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerTool(
    'coverage',
    {
      title: 'Which declared events have never fired',
      description:
        'Diff the app\'s declared event catalog against what PostHog has actually received. ' +
        'A declared event with zero volume is an un-instrumented flow, a typo, or a feature ' +
        'nobody uses - and the three are worth telling apart.',
      inputSchema: {
        days: z.number().int().positive().max(365).optional().describe('Lookback in days. Default 30.'),
      },
    },
    async ({ days }) => {
      try {
        const rows = await run(
          `SELECT event, count() AS volume FROM events
           WHERE timestamp > now() - INTERVAL ${days ?? 30} DAY
           GROUP BY event`,
        )

        const seen = new Map(rows.map((r) => [String(r.event), Number(r.volume)]))
        const missing = DECLARED_EVENTS.filter((name) => !seen.has(name))
        const undeclared = [...seen.keys()].filter(
          (name) => !(DECLARED_EVENTS as readonly string[]).includes(name) && !name.startsWith('$'),
        )

        return textResult(
          JSON.stringify(
            {
              windowDays: days ?? 30,
              declared: DECLARED_EVENTS.length,
              firing: DECLARED_EVENTS.filter((n) => seen.has(n)).map((n) => ({
                event: n,
                volume: seen.get(n),
              })),
              declaredButNeverFired: missing,
              // Usually a rename that only landed on one side.
              firedButNotDeclared: undeclared,
            },
            null,
            2,
          ),
        )
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  return server
}
