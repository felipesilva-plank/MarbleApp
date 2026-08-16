import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { openDb } from './db.js'
import type { InventoryDb } from './db.js'
import { describeTable, fullSchema, listTables, sampleRows } from './introspect.js'
import { QueryRejected, runQuery, MAX_ROWS } from './query.js'

/**
 * MCP server over a snapshot of the MarbleApp inventory.
 *
 * The point is answering questions *while implementing a feature* - "how deep does lineage
 * actually go in real data?", "how many remnants have no recorded origin?" - without stopping to
 * write a script. Those answers change what you build; guessing at them is how you ship a tree
 * view that falls over at depth 6.
 */

function textResult(text: string, isError = false) {
  return { content: [{ type: 'text' as const, text }], ...(isError ? { isError: true } : {}) }
}

/**
 * An error the model can act on. "Error" tells it to give up; naming the available tables tells it
 * what to try next, which is the difference between one wasted turn and five.
 */
function errorResult(error: unknown, hint?: string) {
  const message = error instanceof Error ? error.message : String(error)
  return textResult(hint ? `${message}\n\n${hint}` : message, true)
}

export function createServer(db: InventoryDb): McpServer {
  const server = new McpServer({ name: 'marble-inventory', version: '0.1.0' })

  server.registerTool(
    'query',
    {
      title: 'Run a read-only SQL query',
      description:
        'Execute a SELECT against a snapshot of the MarbleApp inventory and return the rows as JSON. ' +
        'SQLite dialect. Read-only: anything other than SELECT/WITH is refused. ' +
        `At most ${MAX_ROWS} rows come back, and the result says so when it truncated. ` +
        'Use this for counts, distributions and joins - e.g. ' +
        "SELECT kind, COUNT(*) FROM pieces GROUP BY kind. " +
        'Call `schema` first if you do not know the columns.',
      inputSchema: {
        sql: z.string().describe('A single SELECT or WITH statement. SQLite dialect.'),
        limit: z
          .number()
          .int()
          .positive()
          .max(MAX_ROWS)
          .optional()
          .describe(`Max rows to return. Defaults to ${MAX_ROWS}.`),
      },
    },
    async ({ sql, limit }) => {
      try {
        const result = runQuery(db, sql, limit ?? MAX_ROWS)
        const note = result.truncated
          ? `\n\nTruncated at ${result.rowCount} rows. Add a LIMIT or aggregate instead of listing.`
          : ''
        return textResult(`${JSON.stringify(result.rows, null, 2)}${note}`)
      } catch (error) {
        if (error instanceof QueryRejected) return errorResult(error)
        return errorResult(
          error,
          `Tables: ${listTables(db)
            .map((t) => t.name)
            .join(', ')}. Call \`schema\` for full column definitions.`,
        )
      }
    },
  )

  server.registerTool(
    'schema',
    {
      title: 'Full database schema',
      description:
        'Return every CREATE TABLE, CREATE VIEW and CREATE INDEX statement. Read this before ' +
        'writing a non-trivial query - the two views (piece_areas, unlinked_pieces) already ' +
        'encode domain rules that are easy to get wrong by hand.',
      inputSchema: {},
    },
    async () => textResult(fullSchema(db)),
  )

  server.registerTool(
    'describe-table',
    {
      title: 'Describe one table',
      description:
        'Columns with types, nullability, primary keys and foreign keys, plus the row count, ' +
        'the indexes, and a few sample rows. Column notes explain the domain meaning that the ' +
        'type cannot - what parent_id being NULL actually means, for instance.',
      inputSchema: {
        table: z.string().describe('Table or view name, e.g. "pieces".'),
        sampleSize: z.number().int().min(0).max(20).optional().describe('Sample rows. Default 3.'),
      },
    },
    async ({ table, sampleSize }) => {
      try {
        const info = describeTable(db, table)
        const samples = sampleSize === 0 ? [] : sampleRows(db, table, sampleSize ?? 3)
        return textResult(JSON.stringify({ ...info, samples }, null, 2))
      } catch (error) {
        return errorResult(error)
      }
    },
  )

  server.registerResource(
    'tables',
    'marble://tables',
    {
      title: 'Inventory tables',
      description: 'Every table and view in the snapshot, with row counts.',
      mimeType: 'application/json',
    },
    async (uri) => {
      const tables = listTables(db).map((t) => ({
        ...t,
        rowCount: describeTable(db, t.name).rowCount,
      }))
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(tables, null, 2),
          },
        ],
      }
    },
  )

  return server
}

export function createServerFromPath(dbPath: string): { server: McpServer; db: InventoryDb } {
  const db = openDb(dbPath)
  return { server: createServer(db), db }
}
