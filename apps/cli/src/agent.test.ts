import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runAgent } from './agent.js'
import { MarbleClient } from './client.js'
import { calculatorTool } from './tools/calculator.js'
import type { Tool, ToolContext } from './tools/types.js'

/**
 * The loop is driven by a scripted Anthropic stub: each entry is one assistant turn. That makes the
 * interesting cases - a model that keeps calling tools, a tool that fails, a cost limit - ordinary
 * unit tests rather than something you can only see by spending money.
 */

type Turn =
  | { text: string }
  | { tools: Array<{ id: string; name: string; input: Record<string, unknown> }> }

function scriptedClient(turns: Turn[], perTurnOutputTokens = 100) {
  let index = 0
  const requests: Array<Record<string, unknown>> = []

  const anthropic = {
    messages: {
      create: vi.fn(async (request: Record<string, unknown>) => {
        // Snapshot, not the live object: the agent reuses one history array and keeps pushing to
        // it, so holding the reference would make every recorded request show the FINAL state.
        requests.push(structuredClone(request))
        const turn = turns[Math.min(index, turns.length - 1)]
        index += 1

        const content =
          'text' in turn
            ? [{ type: 'text' as const, text: turn.text }]
            : turn.tools.map((t) => ({
                type: 'tool_use' as const,
                id: t.id,
                name: t.name,
                input: t.input,
              }))

        return {
          content,
          usage: {
            input_tokens: 1000,
            output_tokens: perTurnOutputTokens,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
          stop_reason: 'text' in turn ? 'end_turn' : 'tool_use',
        }
      }),
      stream: vi.fn(),
    },
  }

  return { client: new MarbleClient({ anthropic: anthropic as never }), requests }
}

async function toolContext(overrides: Partial<ToolContext> = {}): Promise<ToolContext> {
  const dir = await mkdtemp(join(tmpdir(), 'marble-agent-'))
  return { fetch: globalThis.fetch, notesPath: join(dir, 'notes.json'), ...overrides }
}

const tools: Tool[] = [calculatorTool]
const ask = (text: string) => [{ role: 'user' as const, content: text }]

describe('runAgent', () => {
  it('returns immediately when the model answers without tools', async () => {
    const { client } = scriptedClient([{ text: 'A remnant is an offcut.' }])
    const result = await runAgent(client, ask('what is a remnant?'), await toolContext(), { tools })

    expect(result.text).toBe('A remnant is an offcut.')
    expect(result.stoppedBecause).toBe('answered')
    expect(result.turns).toBe(1)
    expect(result.toolCalls).toBe(0)
  })

  it('runs a tool, feeds the result back and continues to an answer', async () => {
    const { client, requests } = scriptedClient([
      { tools: [{ id: 'tu_1', name: 'calculator', input: { expression: '3200 * 1900 / 1000000' } }] },
      { text: 'The slab is 6.08 m2.' },
    ])

    const result = await runAgent(client, ask('area of a 3200x1900 slab?'), await toolContext(), {
      tools,
    })

    expect(result.text).toBe('The slab is 6.08 m2.')
    expect(result.toolCalls).toBe(1)
    expect(result.turns).toBe(2)

    // The second request must carry the assistant's tool_use turn and a matching tool_result.
    const second = requests[1].messages as Array<{ role: string; content: unknown }>
    expect(second).toHaveLength(3)
    expect(second[2].role).toBe('user')
    expect(JSON.stringify(second[2].content)).toContain('6.08')
  })

  it('sends every tool result block back with its matching tool_use id', async () => {
    const { client, requests } = scriptedClient([
      {
        tools: [
          { id: 'tu_a', name: 'calculator', input: { expression: '1+1' } },
          { id: 'tu_b', name: 'calculator', input: { expression: '2+2' } },
        ],
      },
      { text: 'done' },
    ])

    await runAgent(client, ask('two sums'), await toolContext(), { tools })

    const results = JSON.stringify((requests[1].messages as unknown[])[2])
    // A missing or mismatched id makes the whole next request invalid.
    expect(results).toContain('tu_a')
    expect(results).toContain('tu_b')
  })

  it('keeps going after a tool error, since the model can recover from it', async () => {
    const { client, requests } = scriptedClient([
      { tools: [{ id: 'tu_1', name: 'calculator', input: { expression: '1/0' } }] },
      { text: 'That is undefined.' },
    ])

    const result = await runAgent(client, ask('what is 1/0?'), await toolContext(), { tools })

    expect(result.stoppedBecause).toBe('answered')
    expect(JSON.stringify((requests[1].messages as unknown[])[2])).toContain('Division by zero')
  })

  it('stops at maxTurns and says which limit it hit', async () => {
    const onLimit = vi.fn()
    const { client } = scriptedClient([
      { tools: [{ id: 'tu_1', name: 'calculator', input: { expression: '1+1' } }] },
    ])

    const result = await runAgent(client, ask('loop forever'), await toolContext(), {
      tools,
      maxTurns: 3,
      events: { onLimit },
    })

    expect(result.stoppedBecause).toBe('max_turns')
    expect(result.turns).toBe(3)
    expect(onLimit).toHaveBeenCalledWith(expect.stringMatching(/after 3 turns/))
  })

  it('stops on the cost limit before making the request that would exceed it', async () => {
    const onLimit = vi.fn()
    // 100k output tokens per turn on sonnet is $1.50 - the second turn trips a $1 limit.
    const { client } = scriptedClient(
      [{ tools: [{ id: 'tu_1', name: 'calculator', input: { expression: '1+1' } }] }],
      100_000,
    )

    const result = await runAgent(client, ask('spend money'), await toolContext(), {
      tools,
      maxTurns: 20,
      maxCostUsd: 1,
      events: { onLimit },
    })

    expect(result.stoppedBecause).toBe('cost_limit')
    expect(onLimit).toHaveBeenCalledWith(expect.stringMatching(/over the \$1\.00 limit/))
  })

  it('honours an abort signal before the first request', async () => {
    const { client } = scriptedClient([{ text: 'never reached' }])
    const controller = new AbortController()
    controller.abort()

    const result = await runAgent(
      client,
      ask('x'),
      await toolContext({ signal: controller.signal }),
      { tools },
    )

    expect(result.stoppedBecause).toBe('aborted')
    expect(result.toolCalls).toBe(0)
  })

  it('narrates tool calls so the user sees what it is doing', async () => {
    const onToolStart = vi.fn()
    const onToolEnd = vi.fn()
    const { client } = scriptedClient([
      { tools: [{ id: 'tu_1', name: 'calculator', input: { expression: '2+2' } }] },
      { text: 'four' },
    ])

    await runAgent(client, ask('2+2'), await toolContext(), {
      tools,
      events: { onToolStart, onToolEnd },
    })

    expect(onToolStart).toHaveBeenCalledWith([
      { name: 'calculator', input: { expression: '2+2' } },
    ])
    expect(onToolEnd).toHaveBeenCalledWith([
      expect.objectContaining({ name: 'calculator', ok: true }),
    ])
  })

  it('accumulates usage across every turn of the run', async () => {
    const { client } = scriptedClient([
      { tools: [{ id: 'tu_1', name: 'calculator', input: { expression: '1+1' } }] },
      { text: 'two' },
    ])

    const result = await runAgent(client, ask('1+1'), await toolContext(), { tools })

    expect(result.usage.inputTokens).toBe(2000)
    expect(result.usage.outputTokens).toBe(200)
    expect(result.costUsd).toBeGreaterThan(0)
  })

  it('declares the tools to the API on every request, not just the first', async () => {
    const { client, requests } = scriptedClient([
      { tools: [{ id: 'tu_1', name: 'calculator', input: { expression: '1+1' } }] },
      { text: 'two' },
    ])

    await runAgent(client, ask('1+1'), await toolContext(), { tools })

    for (const request of requests) {
      expect((request.tools as unknown[])).toHaveLength(1)
    }
  })

  it('leaves the caller\'s message array untouched', async () => {
    const { client } = scriptedClient([{ text: 'hi' }])
    const messages = ask('hello')

    await runAgent(client, messages, await toolContext(), { tools })

    expect(messages).toHaveLength(1)
  })
})
