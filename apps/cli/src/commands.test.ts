import { describe, expect, it } from 'vitest'
import { isCommand, runCommand } from './commands.js'
import type { CommandContext } from './commands.js'
import { EMPTY_USAGE, MODELS } from './models.js'
import { addAssistant, addUser, createSession, rollbackLastUser, turnCount } from './session.js'
import type { SessionState } from './session.js'

function context(overrides: Partial<CommandContext> = {}): CommandContext {
  return { state: createSession(), usage: [], totalCostUsd: 0, ...overrides }
}

const run = (line: string, ctx: CommandContext) => runCommand(line, ctx).output

describe('isCommand', () => {
  it('recognises a leading slash and nothing else', () => {
    expect(isCommand('/help')).toBe(true)
    expect(isCommand('what is a remnant?')).toBe(false)
    expect(isCommand(' /help')).toBe(false)
  })
})

describe('/model', () => {
  it('lists the models and marks the current one', () => {
    const output = run('/model', context())
    expect(output).toContain('* sonnet')
    expect(output).toContain('  haiku')
    expect(output).toContain(MODELS.sonnet.id)
  })

  it('switches by alias', () => {
    const ctx = context()
    expect(run('/model haiku', ctx)).toContain(MODELS.haiku.id)
    expect(ctx.state.model).toBe('haiku')
  })

  it('keeps the conversation when switching, which is the point of switching mid-thread', () => {
    const ctx = context()
    addUser(ctx.state, 'hello')
    addAssistant(ctx.state, 'hi')
    run('/model opus', ctx)
    expect(ctx.state.messages).toHaveLength(2)
  })

  it('accepts a full model id', () => {
    const ctx = context()
    run('/model claude-future-1', ctx)
    expect(ctx.state.model).toBe('claude-future-1')
  })

  it('warns that an unpriced model makes /cost under-report', () => {
    expect(run('/model claude-future-1', context())).toMatch(/under-report/)
  })

  it('rejects a typo without changing anything', () => {
    const ctx = context()
    expect(run('/model sonet', ctx)).toMatch(/Unknown model/)
    expect(ctx.state.model).toBe('sonnet')
  })
})

describe('/temp', () => {
  it('reports the current value', () => {
    expect(run('/temp', context())).toBe('Temperature is 1.')
  })

  it('sets a valid value', () => {
    const ctx = context()
    run('/temp 0.3', ctx)
    expect(ctx.state.temperature).toBe(0.3)
  })

  it('explains what 0 is for', () => {
    expect(run('/temp 0', context())).toMatch(/Deterministic/)
  })

  it.each(['1.5', '-1', 'warm'])('rejects %s and leaves the value alone', (input) => {
    const ctx = context()
    expect(run(`/temp ${input}`, ctx)).toMatch(/must be between 0 and 1/)
    expect(ctx.state.temperature).toBe(1)
  })
})

describe('/max-tokens', () => {
  it('sets a whole number', () => {
    const ctx = context()
    run('/max-tokens 512', ctx)
    expect(ctx.state.maxTokens).toBe(512)
  })

  it.each(['0', '-5', '1.5', 'lots'])('rejects %s', (input) => {
    const ctx = context()
    run(`/max-tokens ${input}`, ctx)
    expect(ctx.state.maxTokens).toBe(4096)
  })
})

describe('/system', () => {
  it('shows the current prompt', () => {
    expect(run('/system', context())).toContain('concise assistant')
  })

  it('sets a new one, keeping the rest of the line intact', () => {
    const ctx = context()
    run('/system You are a stone yard foreman. Be blunt.', ctx)
    expect(ctx.state.system).toBe('You are a stone yard foreman. Be blunt.')
  })

  it('says the change applies to history too, which is the surprising part', () => {
    expect(run('/system Be terse.', context())).toMatch(/already in history/)
  })

  it('resets to the default', () => {
    const ctx = context()
    run('/system Something else', ctx)
    run('/system reset', ctx)
    expect(ctx.state.system).toBe(createSession().system)
  })

  it('removes it entirely with "none"', () => {
    const ctx = context()
    run('/system none', ctx)
    expect(ctx.state.system).toBeUndefined()
  })
})

describe('/clear', () => {
  it('drops the conversation', () => {
    const ctx = context()
    addUser(ctx.state, 'hello')
    addAssistant(ctx.state, 'hi')
    run('/clear', ctx)
    expect(ctx.state.messages).toEqual([])
  })

  it('keeps the settings - re-typing them every time is what stops people using /clear', () => {
    const ctx = context()
    run('/model haiku', ctx)
    run('/temp 0', ctx)
    run('/system Be blunt.', ctx)
    run('/clear', ctx)

    expect(ctx.state.model).toBe('haiku')
    expect(ctx.state.temperature).toBe(0)
    expect(ctx.state.system).toBe('Be blunt.')
  })
})

describe('/cost', () => {
  it('says nothing has been sent rather than printing a table of zeros', () => {
    expect(run('/cost', context())).toBe('Nothing sent yet this session.')
  })

  it('breaks the total down per model', () => {
    const state = createSession()
    addUser(state, 'one')
    const output = run(
      '/cost',
      context({
        state,
        usage: [
          {
            model: MODELS.haiku,
            usage: { ...EMPTY_USAGE, inputTokens: 1200, outputTokens: 300 },
            costUsd: 0.0027,
          },
          {
            model: MODELS.opus,
            usage: { ...EMPTY_USAGE, inputTokens: 4000, outputTokens: 900 },
            costUsd: 0.1275,
          },
        ],
        totalCostUsd: 0.1302,
      }),
    )

    expect(output).toContain('haiku')
    expect(output).toContain('opus')
    expect(output).toContain('$0.13')
    expect(output).toContain('over 1 turns')
  })

  it('flags that the total is a floor when an unpriced model was used', () => {
    const output = run(
      '/cost',
      context({
        usage: [
          {
            model: { ...MODELS.sonnet, id: 'claude-future-1', inputPerMTok: 0, outputPerMTok: 0 },
            usage: { ...EMPTY_USAGE, inputTokens: 5000 },
            costUsd: 0,
          },
        ],
      }),
    )
    expect(output).toMatch(/is a floor/)
  })

  it('says when the pricing was last checked, rather than presenting it as current', () => {
    expect(
      run('/cost', context({ usage: [{ model: MODELS.sonnet, usage: EMPTY_USAGE, costUsd: 0 }] })),
    ).toMatch(/rates last checked/)
  })
})

describe('/help and /exit', () => {
  it('lists every command', () => {
    const output = run('/help', context())
    for (const command of [
      '/model',
      '/temp',
      '/max-tokens',
      '/system',
      '/cost',
      '/clear',
      '/research',
      '/limits',
      '/exit',
    ]) {
      expect(output).toContain(command)
    }
  })

  it('signals exit rather than calling process.exit from inside a command', () => {
    expect(runCommand('/exit', context())).toEqual({ output: 'Bye.', exit: true })
  })

  it('points an unknown command at /help', () => {
    expect(run('/nope', context())).toMatch(/Unknown command "\/nope"\. Try \/help\./)
  })
})

describe('session', () => {
  it('counts user turns, not messages', () => {
    const state: SessionState = createSession()
    addUser(state, 'a')
    addAssistant(state, 'b')
    addUser(state, 'c')
    expect(turnCount(state)).toBe(2)
  })

  it('rolls back a dangling user turn so the next request is not two users in a row', () => {
    const state = createSession()
    addUser(state, 'a')
    addAssistant(state, 'b')
    addUser(state, 'c')
    rollbackLastUser(state)
    expect(state.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it('does not roll back an assistant turn', () => {
    const state = createSession()
    addUser(state, 'a')
    addAssistant(state, 'b')
    rollbackLastUser(state)
    expect(state.messages).toHaveLength(2)
  })
})

describe('/limits', () => {
  it('reports both guards', () => {
    expect(run('/limits', context())).toBe('Max 15 tool-use turns per question, $1.00 cost limit.')
  })

  it('sets turns alone', () => {
    const ctx = context()
    run('/limits 5', ctx)
    expect(ctx.state.maxTurns).toBe(5)
    expect(ctx.state.maxCostUsd).toBe(1)
  })

  it('sets turns and cost together', () => {
    const ctx = context()
    run('/limits 30 0.25', ctx)
    expect(ctx.state.maxTurns).toBe(30)
    expect(ctx.state.maxCostUsd).toBe(0.25)
  })

  it('removes the cost limit with "none"', () => {
    const ctx = context()
    run('/limits 10 none', ctx)
    expect(ctx.state.maxCostUsd).toBeNull()
  })

  it.each(['0', '99', 'lots'])('rejects %s turns without changing anything', (input) => {
    const ctx = context()
    run(`/limits ${input}`, ctx)
    expect(ctx.state.maxTurns).toBe(15)
  })

  it('rejects a negative cost limit', () => {
    const ctx = context()
    run('/limits 5 -1', ctx)
    expect(ctx.state.maxCostUsd).toBe(1)
  })
})
