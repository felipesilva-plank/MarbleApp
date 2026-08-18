import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MarbleClient } from './client.js'
import { extractTagged, parseSearchResults, research } from './research.js'
import type { ToolContext } from './tools/types.js'

/**
 * The whole chain, driven by a stubbed API and a stubbed fetch. What is worth pinning down is the
 * routing (cheap model for the mechanical steps), the dedupe, and what happens when a source is
 * unreachable - none of which needs a real network call to observe.
 */

function stubClient(replies: Array<{ match?: RegExp; text: string }>) {
  const calls: Array<{ model: string; prompt: string; temperature?: number }> = []

  const anthropic = {
    messages: {
      create: vi.fn(async (request: Record<string, unknown>) => {
        const messages = request.messages as Array<{ content: string }>
        const prompt = messages[0].content
        calls.push({
          model: String(request.model),
          prompt,
          temperature: request.temperature as number | undefined,
        })

        const reply =
          replies.find((r) => r.match && r.match.test(prompt)) ??
          replies.find((r) => !r.match) ?? { text: '' }

        return {
          content: [{ type: 'text' as const, text: reply.text }],
          usage: {
            input_tokens: 500,
            output_tokens: 200,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          stop_reason: 'end_turn',
        }
      }),
      stream: vi.fn(),
    },
  }

  return { client: new MarbleClient({ anthropic: anthropic as never }), calls }
}

function page(html: string) {
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
}

function braveResults(entries: Array<{ title: string; url: string }>) {
  return new Response(JSON.stringify({ web: { results: entries } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function context(fetchImpl: typeof fetch): Promise<ToolContext> {
  const dir = await mkdtemp(join(tmpdir(), 'marble-research-'))
  return { fetch: fetchImpl, notesPath: join(dir, 'notes.json') }
}

const REPLIES = [
  { match: /Write 3 web search queries/, text: '<query>kerf loss stone</query><query>saw blade width marble</query><query>offcut yield slab</query>' },
  { match: /Pull out only what is relevant/, text: 'Typical kerf is 3 mm for a 20 mm slab.' },
  { match: /Write a short structured report/, text: '## Kerf\nAbout 3 mm [1].\n\n## Sources\n1. https://a.example' },
]

let previousKey: string | undefined

beforeEach(() => {
  previousKey = process.env.BRAVE_API_KEY
  process.env.BRAVE_API_KEY = 'brave_test'
})

afterEach(() => {
  if (previousKey === undefined) delete process.env.BRAVE_API_KEY
  else process.env.BRAVE_API_KEY = previousKey
})

describe('extractTagged', () => {
  it('pulls every tagged value out', () => {
    expect(extractTagged('<query>a</query> junk <query>b</query>', 'query')).toEqual(['a', 'b'])
  })

  it('handles a value spanning lines', () => {
    expect(extractTagged('<query>a\nb</query>', 'query')).toEqual(['a\nb'])
  })

  it('is empty when the model ignored the format', () => {
    expect(extractTagged('here are your queries: a, b', 'query')).toEqual([])
  })
})

describe('parseSearchResults', () => {
  it('reads the numbered title/url pairs the search tool emits', () => {
    expect(
      parseSearchResults('1. First\n   https://a.example\n   snippet\n\n2. Second\n   https://b.example'),
    ).toEqual([
      { title: 'First', url: 'https://a.example' },
      { title: 'Second', url: 'https://b.example' },
    ])
  })

  it('skips an entry whose second line is not a URL', () => {
    expect(parseSearchResults('1. Broken\n   not a url')).toEqual([])
  })
})

describe('research', () => {
  it('runs four steps and returns a cited report', async () => {
    const { client, calls } = stubClient(REPLIES)
    const ctx = await context((async (url: string) =>
      String(url).includes('search.brave.com')
        ? braveResults([{ title: 'A', url: 'https://a.example' }])
        : page('<p>Kerf is 3 mm.</p>')) as never)

    const result = await research(client, 'kerf loss', ctx, { sourceCount: 1 })

    expect(result.queries).toHaveLength(3)
    expect(result.report).toContain('[1]')
    expect(result.sources[0].extract).toContain('3 mm')
    // 1 planning + 1 extraction + 1 synthesis
    expect(calls).toHaveLength(3)
  })

  it('routes the mechanical steps to the cheap model and the rest to the strong one', async () => {
    const { client, calls } = stubClient(REPLIES)
    const ctx = await context((async (url: string) =>
      String(url).includes('search.brave.com')
        ? braveResults([{ title: 'A', url: 'https://a.example' }])
        : page('<p>text</p>')) as never)

    await research(client, 'kerf loss', ctx, { sourceCount: 1 })

    expect(calls[0].model).toContain('haiku')
    expect(calls[1].model).toContain('sonnet')
    expect(calls[2].model).toContain('sonnet')
  })

  it('plans and extracts at temperature 0, and only warms up for the writing step', async () => {
    const { client, calls } = stubClient(REPLIES)
    const ctx = await context((async (url: string) =>
      String(url).includes('search.brave.com')
        ? braveResults([{ title: 'A', url: 'https://a.example' }])
        : page('<p>text</p>')) as never)

    await research(client, 'kerf loss', ctx, { sourceCount: 1 })

    expect(calls[0].temperature).toBe(0)
    expect(calls[1].temperature).toBe(0)
    expect(calls[2].temperature).toBe(0.3)
  })

  it('reads a page that ranks for two queries only once', async () => {
    const { client, calls } = stubClient(REPLIES)
    const ctx = await context((async (url: string) =>
      String(url).includes('search.brave.com')
        ? // Every query returns the same URL.
          braveResults([{ title: 'Same', url: 'https://same.example' }])
        : page('<p>text</p>')) as never)

    const result = await research(client, 'kerf loss', ctx, { sourceCount: 3 })

    expect(result.sources).toHaveLength(1)
    // Reading is the expensive step; doing it three times would triple the run's cost.
    expect(calls.filter((c) => /Pull out only/.test(c.prompt))).toHaveLength(1)
  })

  it('records an unreachable source rather than silently dropping it', async () => {
    const { client } = stubClient(REPLIES)
    const ctx = await context((async (url: string) => {
      if (String(url).includes('search.brave.com')) {
        return braveResults([
          { title: 'Good', url: 'https://good.example' },
          { title: 'Dead', url: 'https://dead.example' },
        ])
      }
      return String(url).includes('dead') ? new Response('', { status: 500 }) : page('<p>text</p>')
    }) as never)

    const result = await research(client, 'kerf loss', ctx, { sourceCount: 2 })

    const dead = result.sources.find((s) => s.url.includes('dead'))
    expect(dead?.extract).toBeNull()
    expect(dead?.error).toContain('500')
    // The report is still written from the source that did work.
    expect(result.report).toContain('Kerf')
  })

  it('drops a source whose page had nothing relevant', async () => {
    const { client } = stubClient([
      REPLIES[0],
      { match: /Pull out only what is relevant/, text: 'NOTHING RELEVANT' },
      REPLIES[2],
    ])
    const ctx = await context((async (url: string) =>
      String(url).includes('search.brave.com')
        ? braveResults([
            { title: 'A', url: 'https://a.example' },
            { title: 'B', url: 'https://b.example' },
          ])
        : page('<p>unrelated</p>')) as never)

    await expect(research(client, 'kerf loss', ctx, { sourceCount: 2 })).rejects.toThrow(
      /none had anything relevant/,
    )
  })

  it('fails clearly when the model ignores the query format', async () => {
    const { client } = stubClient([{ text: 'Sure! Here are some queries: kerf, blade, offcut.' }])
    const ctx = await context((async () => braveResults([])) as never)

    await expect(research(client, 'kerf loss', ctx)).rejects.toThrow(/Could not turn/)
  })

  it('names the missing API key as a likely cause when nothing is found', async () => {
    const { client } = stubClient(REPLIES)
    const ctx = await context((async () => braveResults([])) as never)

    await expect(research(client, 'kerf loss', ctx)).rejects.toThrow(/BRAVE_API_KEY/)
  })

  it('survives one search failing without losing the others', async () => {
    const { client } = stubClient(REPLIES)
    let searches = 0
    const ctx = await context((async (url: string) => {
      if (String(url).includes('search.brave.com')) {
        searches += 1
        if (searches === 1) return new Response('', { status: 500 })
        return braveResults([{ title: 'A', url: `https://a${searches}.example` }])
      }
      return page('<p>text</p>')
    }) as never)

    const result = await research(client, 'kerf loss', ctx, { sourceCount: 2 })
    expect(result.sources.length).toBeGreaterThan(0)
  })

  it('breaks the cost down per step, which is the point of routing models', async () => {
    const { client } = stubClient(REPLIES)
    const ctx = await context((async (url: string) =>
      String(url).includes('search.brave.com')
        ? braveResults([{ title: 'A', url: 'https://a.example' }])
        : page('<p>text</p>')) as never)

    const result = await research(client, 'kerf loss', ctx, { sourceCount: 1 })

    expect(result.breakdown.map((b) => b.step)).toEqual([
      'plan queries',
      'read a.example',
      'synthesise',
    ])
    expect(result.breakdown[0].model).toBe('haiku')
    // Planning on Haiku must be cheaper than the same tokens on Sonnet.
    expect(result.breakdown[0].costUsd).toBeLessThan(result.breakdown[2].costUsd)
    expect(result.costUsd).toBeCloseTo(
      result.breakdown.reduce((sum, b) => sum + b.costUsd, 0),
      10,
    )
  })

  it('reports each step as it starts, so a slow run is legible', async () => {
    const onStep = vi.fn()
    const { client } = stubClient(REPLIES)
    const ctx = await context((async (url: string) =>
      String(url).includes('search.brave.com')
        ? braveResults([{ title: 'A', url: 'https://a.example' }])
        : page('<p>text</p>')) as never)

    await research(client, 'kerf loss', ctx, { sourceCount: 1, onStep })

    expect(onStep.mock.calls.map((c) => c[0])).toEqual([1, 2, 3, 4])
    expect(onStep.mock.calls[1][1]).toContain('kerf loss stone')
  })
})
