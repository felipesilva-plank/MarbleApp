import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { MarbleClient, MissingApiKeyError } from './client.js'
import { addUsage, costUsd, EMPTY_USAGE, formatTokens, formatUsd, MODELS, resolveModel } from './models.js'

/**
 * A stub Anthropic surface, so these run with no API key and no network. What is worth testing is
 * the request we build, the usage we accumulate and the cost we compute - none of which needs a
 * real call.
 */
function stubAnthropic(
  reply: Partial<{
    text: string
    input: number
    output: number
    cacheCreation: number
    cacheRead: number
    stopReason: string
  }> = {},
) {
  const requests: Record<string, unknown>[] = []
  const streamed: string[] = []

  const message = {
    content: [{ type: 'text' as const, text: reply.text ?? 'hello' }],
    usage: {
      input_tokens: reply.input ?? 100,
      output_tokens: reply.output ?? 50,
      cache_creation_input_tokens: reply.cacheCreation ?? 0,
      cache_read_input_tokens: reply.cacheRead ?? 0,
    },
    stop_reason: reply.stopReason ?? 'end_turn',
  }

  const anthropic = {
    messages: {
      create: vi.fn(async (request: Record<string, unknown>) => {
        requests.push(request)
        return message
      }),
      stream: vi.fn((request: Record<string, unknown>) => {
        requests.push(request)
        const handlers: Array<(delta: string) => void> = []
        return {
          on(_event: string, handler: (delta: string) => void) {
            handlers.push(handler)
            return this
          },
          async finalMessage() {
            for (const chunk of (reply.text ?? 'hello').match(/.{1,3}/g) ?? []) {
              streamed.push(chunk)
              handlers.forEach((h) => h(chunk))
            }
            return message
          },
        }
      }),
    },
  }

  return { anthropic: anthropic as never, requests, streamed }
}

describe('MarbleClient', () => {
  it('refuses to construct without a key, and says where to put one', () => {
    const previous = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    // envPath points nowhere on purpose: without it this passes or fails depending on whether the
    // machine running the suite happens to have a .env.local, which it did.
    const options = { envPath: '/nonexistent/.env.local' }
    try {
      expect(() => new MarbleClient(options)).toThrow(MissingApiKeyError)
      expect(() => new MarbleClient(options)).toThrow(/\.env\.local/)
    } finally {
      if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous
    }
  })

  it('picks the key up from .env.local when it is not exported', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'marble-client-env-'))
    const envPath = join(dir, '.env.local')
    await writeFile(envPath, 'ANTHROPIC_API_KEY=sk-ant-from-file\n', 'utf8')

    const previous = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    try {
      expect(() => new MarbleClient({ envPath })).not.toThrow()
    } finally {
      delete process.env.ANTHROPIC_API_KEY
      if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous
    }
  })

  it('resolves an alias to a model id', async () => {
    const { anthropic, requests } = stubAnthropic()
    await new MarbleClient({ anthropic }).ask([{ role: 'user', content: 'hi' }], { model: 'haiku' })
    expect(requests[0].model).toBe(MODELS.haiku.id)
  })

  it('omits temperature and stop sequences when not asked for, rather than sending defaults', async () => {
    const { anthropic, requests } = stubAnthropic()
    await new MarbleClient({ anthropic }).ask([{ role: 'user', content: 'hi' }])
    expect(requests[0]).not.toHaveProperty('temperature')
    expect(requests[0]).not.toHaveProperty('stop_sequences')
    expect(requests[0]).not.toHaveProperty('system')
  })

  it('passes system, temperature and stop sequences through when given', async () => {
    const { anthropic, requests } = stubAnthropic()
    await new MarbleClient({ anthropic }).ask([{ role: 'user', content: 'hi' }], {
      system: 'Be terse.',
      temperature: 0,
      stopSequences: ['</done>'],
      maxTokens: 128,
    })
    expect(requests[0]).toMatchObject({
      system: 'Be terse.',
      temperature: 0,
      stop_sequences: ['</done>'],
      max_tokens: 128,
    })
  })

  it('streams deltas when onText is supplied, and still returns the full text', async () => {
    const { anthropic } = stubAnthropic({ text: 'abcdefg' })
    const chunks: string[] = []
    const result = await new MarbleClient({ anthropic }).ask([{ role: 'user', content: 'hi' }], {
      onText: (delta) => chunks.push(delta),
    })

    expect(chunks.join('')).toBe('abcdefg')
    expect(result.text).toBe('abcdefg')
  })

  it('uses the non-streaming call when no onText is given', async () => {
    const { anthropic } = stubAnthropic()
    await new MarbleClient({ anthropic }).ask([{ role: 'user', content: 'hi' }])
    expect((anthropic as never as { messages: { create: { mock: unknown } } }).messages.create)
      .toHaveBeenCalledOnce()
  })

  it('accumulates usage across turns', async () => {
    const { anthropic } = stubAnthropic({ input: 100, output: 50 })
    const client = new MarbleClient({ anthropic })

    await client.ask([{ role: 'user', content: 'one' }])
    await client.ask([{ role: 'user', content: 'two' }])

    const [entry] = client.sessionUsage()
    expect(entry.usage.inputTokens).toBe(200)
    expect(entry.usage.outputTokens).toBe(100)
  })

  it('keeps totals per model, because a mixed session has no single price', async () => {
    const { anthropic } = stubAnthropic({ input: 1_000_000, output: 0 })
    const client = new MarbleClient({ anthropic })

    await client.ask([{ role: 'user', content: 'x' }], { model: 'haiku' })
    await client.ask([{ role: 'user', content: 'x' }], { model: 'opus' })

    const byAlias = Object.fromEntries(client.sessionUsage().map((e) => [e.model.alias, e.costUsd]))
    expect(byAlias.haiku).toBeCloseTo(1, 5)
    expect(byAlias.opus).toBeCloseTo(15, 5)
    expect(client.sessionCostUsd()).toBeCloseTo(16, 5)
  })

  it('reports the stop reason so a truncated reply is distinguishable from a finished one', async () => {
    const { anthropic } = stubAnthropic({ stopReason: 'max_tokens' })
    const result = await new MarbleClient({ anthropic }).ask([{ role: 'user', content: 'hi' }])
    expect(result.stopReason).toBe('max_tokens')
  })
})

describe('costUsd', () => {
  it('prices input and output at their separate rates', () => {
    const cost = costUsd(MODELS.sonnet, { ...EMPTY_USAGE, inputTokens: 1e6, outputTokens: 1e6 })
    expect(cost).toBeCloseTo(3 + 15, 5)
  })

  it('charges a cache write at 1.25x input', () => {
    const cost = costUsd(MODELS.sonnet, { ...EMPTY_USAGE, cacheCreationTokens: 1e6 })
    expect(cost).toBeCloseTo(3.75, 5)
  })

  it('charges a cache read at 0.1x input - folding these into input would make caching look free', () => {
    const cost = costUsd(MODELS.sonnet, { ...EMPTY_USAGE, cacheReadTokens: 1e6 })
    expect(cost).toBeCloseTo(0.3, 5)
  })

  it('is zero for an unknown model id rather than guessing a price', () => {
    expect(costUsd(resolveModel('claude-future-9'), { ...EMPTY_USAGE, inputTokens: 1e9 })).toBe(0)
  })
})

describe('formatting', () => {
  it('shows four decimals under a cent, since sub-cent is the normal case', () => {
    expect(formatUsd(0.0031)).toBe('$0.0031')
    expect(formatUsd(1.5)).toBe('$1.50')
    expect(formatUsd(0)).toBe('$0.00')
  })

  it('abbreviates thousands of tokens', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1500)).toBe('1.5k')
  })
})

describe('addUsage', () => {
  it('sums every field, including the cache ones', () => {
    const a = { inputTokens: 1, outputTokens: 2, cacheCreationTokens: 3, cacheReadTokens: 4 }
    expect(addUsage(a, a)).toEqual({
      inputTokens: 2,
      outputTokens: 4,
      cacheCreationTokens: 6,
      cacheReadTokens: 8,
    })
  })
})

describe('resolveModel', () => {
  it('accepts a full model id as well as an alias', () => {
    expect(resolveModel(MODELS.opus.id).alias).toBe('opus')
  })

  it('passes an unknown id through instead of refusing - the API decides what exists', () => {
    const spec = resolveModel('claude-something-new')
    expect(spec.id).toBe('claude-something-new')
    expect(spec.inputPerMTok).toBe(0)
  })
})
