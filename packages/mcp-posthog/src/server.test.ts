import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { configFromEnv, PostHogError, quote, toObjects } from './posthog.js'
import type { Fetch, PostHogConfig } from './posthog.js'
import { createServer, DECLARED_EVENTS } from './server.js'

/**
 * `fetch` is injected, so these run against a stub instead of PostHog. That keeps the suite green
 * with no API key - and the interesting behaviour is entirely in the query we build and the
 * message we hand back, both of which a stub exercises fully.
 */

const config: PostHogConfig = {
  apiKey: 'phx_test',
  projectId: '123',
  host: 'https://eu.posthog.com',
}

interface Call {
  url: string
  query: string
  headers: Record<string, string>
}

function stubFetch(
  respond: (query: string) => { columns: string[]; results: unknown[][] } | { status: number },
) {
  const calls: Call[] = []
  const doFetch = (async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: { query: string } }
    const query = body.query.query
    calls.push({
      url: String(url),
      query,
      headers: init?.headers as Record<string, string>,
    })

    const outcome = respond(query)
    if ('status' in outcome) {
      return new Response('nope', { status: outcome.status, statusText: 'Error' })
    }
    return new Response(JSON.stringify(outcome), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as unknown as Fetch

  return { doFetch, calls }
}

async function connect(doFetch: Fetch) {
  const client = new Client({ name: 'test', version: '0.0.0' })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await Promise.all([createServer(config, doFetch).connect(b), client.connect(a)])
  return client
}

function textOf(result: unknown): string {
  return (result as { content: Array<{ text?: string }> }).content.map((c) => c.text ?? '').join('')
}

describe('quote', () => {
  it('escapes a single quote so a name cannot break out of the literal', () => {
    expect(quote("it's")).toBe("'it\\'s'")
  })

  it('escapes a backslash first, so the quote escape cannot be neutralised', () => {
    expect(quote('a\\')).toBe("'a\\\\'")
  })
})

describe('toObjects', () => {
  it('zips columns onto rows', () => {
    expect(toObjects({ columns: ['a', 'b'], results: [[1, 2]] })).toEqual([{ a: 1, b: 2 }])
  })
})

describe('configFromEnv', () => {
  it('names every missing variable at once rather than one per run', () => {
    expect(() => configFromEnv({} as NodeJS.ProcessEnv)).toThrow(
      /POSTHOG_API_KEY and POSTHOG_PROJECT_ID/,
    )
  })

  it('defaults to the EU host', () => {
    const cfg = configFromEnv({
      POSTHOG_API_KEY: 'phx',
      POSTHOG_PROJECT_ID: '1',
    } as NodeJS.ProcessEnv)
    expect(cfg.host).toBe('https://eu.posthog.com')
  })
})

describe('marble-posthog MCP server', () => {
  it('advertises the four tools', async () => {
    const { doFetch } = stubFetch(() => ({ columns: [], results: [] }))
    const { tools } = await (await connect(doFetch)).listTools()
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check-event-fired',
      'coverage',
      'get-event-definitions',
      'get-events',
    ])
  })

  it('sends the personal key as a bearer token to the project query endpoint', async () => {
    const { doFetch, calls } = stubFetch(() => ({ columns: [], results: [] }))
    const client = await connect(doFetch)
    await client.callTool({ name: 'get-events', arguments: {} })

    expect(calls[0].url).toBe('https://eu.posthog.com/api/projects/123/query/')
    expect(calls[0].headers.Authorization).toBe('Bearer phx_test')
  })

  it('filters by event name using a quoted literal', async () => {
    const { doFetch, calls } = stubFetch(() => ({ columns: [], results: [] }))
    const client = await connect(doFetch)
    await client.callTool({ name: 'get-events', arguments: { event: 'piece_created', minutes: 15 } })

    expect(calls[0].query).toContain("event = 'piece_created'")
    expect(calls[0].query).toContain('INTERVAL 15 MINUTE')
  })

  it('explains ingestion lag instead of implying the instrumentation is broken', async () => {
    const { doFetch } = stubFetch(() => ({ columns: ['timestamp'], results: [] }))
    const client = await connect(doFetch)
    const result = await client.callTool({ name: 'get-events', arguments: { minutes: 5 } })

    expect(textOf(result)).toMatch(/ingestion lags/)
  })

  it('answers check-event-fired with a plain YES and the count', async () => {
    const { doFetch } = stubFetch(() => ({
      columns: ['occurrences', 'last_seen'],
      results: [[3, '2026-08-16T14:02:00Z']],
    }))
    const client = await connect(doFetch)
    const result = await client.callTool({
      name: 'check-event-fired',
      arguments: { event: 'piece_created' },
    })

    expect(textOf(result)).toMatch(/^YES - "piece_created" fired 3 times/)
  })

  it('says NO and lists the likely causes for a declared event', async () => {
    const { doFetch } = stubFetch(() => ({
      columns: ['occurrences', 'last_seen'],
      results: [[0, null]],
    }))
    const client = await connect(doFetch)
    const text = textOf(
      await client.callTool({ name: 'check-event-fired', arguments: { event: 'preset_saved' } }),
    )

    expect(text).toMatch(/^NO -/)
    expect(text).toMatch(/declared in the app catalog/)
  })

  it('says NO and flags the name as unknown when it is not in the catalog', async () => {
    const { doFetch } = stubFetch(() => ({
      columns: ['occurrences', 'last_seen'],
      results: [[0, null]],
    }))
    const client = await connect(doFetch)
    const text = textOf(
      await client.callTool({ name: 'check-event-fired', arguments: { event: 'pieceCreated' } }),
    )

    expect(text).toMatch(/NOT in the declared catalog/)
    expect(text).toContain('piece_created')
  })

  it('reports declared-but-never-fired and fired-but-not-declared separately', async () => {
    const { doFetch } = stubFetch(() => ({
      columns: ['event', 'volume'],
      results: [
        ['piece_created', 42],
        ['pieceCreated', 3],
        ['$pageview', 900],
      ],
    }))
    const client = await connect(doFetch)
    const report = JSON.parse(textOf(await client.callTool({ name: 'coverage', arguments: {} })))

    expect(report.firing).toEqual([{ event: 'piece_created', volume: 42 }])
    expect(report.declaredButNeverFired).toContain('preset_saved')
    expect(report.declaredButNeverFired).not.toContain('piece_created')
    // The camelCase twin is the finding; PostHog's own $-prefixed events are not.
    expect(report.firedButNotDeclared).toEqual(['pieceCreated'])
  })

  it('reports every declared event as missing when nothing has fired', async () => {
    const { doFetch } = stubFetch(() => ({ columns: ['event', 'volume'], results: [] }))
    const client = await connect(doFetch)
    const report = JSON.parse(textOf(await client.callTool({ name: 'coverage', arguments: {} })))

    expect(report.declaredButNeverFired).toEqual([...DECLARED_EVENTS])
  })

  it('distinguishes a credentials failure from a query failure', async () => {
    const { doFetch } = stubFetch(() => ({ status: 401 }))
    const client = await connect(doFetch)
    const result = await client.callTool({ name: 'get-events', arguments: {} })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/rejected the credentials/)
    expect(textOf(result)).toMatch(/POSTHOG_API_KEY/)
  })

  it('surfaces a server error with its status', async () => {
    const { doFetch } = stubFetch(() => ({ status: 500 }))
    const client = await connect(doFetch)
    const result = await client.callTool({ name: 'get-events', arguments: {} })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('500')
  })
})

describe('PostHogError', () => {
  it('carries the status for callers that branch on it', () => {
    expect(new PostHogError('x', 403).status).toBe(403)
  })
})
