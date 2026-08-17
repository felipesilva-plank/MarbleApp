import {
  formatTokens,
  formatUsd,
  isModelAlias,
  MODEL_ALIASES,
  MODELS,
  PRICING_VERIFIED_ON,
  resolveModel,
} from './models.js'
import type { ModelSpec, Usage } from './models.js'
import { createSession, turnCount } from './session.js'
import type { SessionState } from './session.js'

/**
 * Slash commands as pure functions over session state.
 *
 * Pure so they are testable without a terminal, and so "what did /model actually do?" is a unit
 * test rather than a manual check. The REPL's only job is reading a line and printing the result.
 */

export interface CommandContext {
  state: SessionState
  usage: Array<{ model: ModelSpec; usage: Usage; costUsd: number }>
  totalCostUsd: number
}

export interface CommandResult {
  output: string
  /** The REPL exits on this rather than calling process.exit from inside a command. */
  exit?: boolean
}

export function isCommand(line: string): boolean {
  return line.startsWith('/')
}

function helpText(): string {
  return [
    'Commands',
    '  /model [opus|sonnet|haiku|<id>]   show or switch the model',
    '  /temp [0-1]                      show or set temperature',
    '  /max-tokens [n]                  show or set the response cap',
    '  /system [text]                   show, set, or (with "reset") restore the system prompt',
    '  /cost                            tokens and estimated spend this session',
    '  /clear                           forget the conversation, keep the settings',
    '  /help                            this list',
    '  /exit                            quit',
    '',
    'Anything else is sent to the model. Ctrl-C cancels a streaming reply; Ctrl-D exits.',
  ].join('\n')
}

function modelReport(state: SessionState): string {
  const current = resolveModel(state.model)
  const lines = ['Models', '']
  for (const alias of MODEL_ALIASES) {
    const spec = MODELS[alias]
    const marker = spec.id === current.id ? '*' : ' '
    lines.push(
      `${marker} ${alias.padEnd(7)} $${spec.inputPerMTok}/$${spec.outputPerMTok} per Mtok in/out`,
      `           ${spec.bestFor}`,
    )
  }
  lines.push('', `Current: ${current.id}`)
  return lines.join('\n')
}

function costReport(context: CommandContext): string {
  if (context.usage.length === 0) return 'Nothing sent yet this session.'

  const lines = ['Session usage', '']
  for (const entry of context.usage) {
    const { usage } = entry
    lines.push(
      `  ${entry.model.alias.padEnd(7)} in ${formatTokens(usage.inputTokens).padStart(6)}` +
        `   out ${formatTokens(usage.outputTokens).padStart(6)}` +
        (usage.cacheReadTokens > 0 ? `   cache-read ${formatTokens(usage.cacheReadTokens)}` : '') +
        `   ${formatUsd(entry.costUsd)}`,
    )
  }

  lines.push('', `  Total ${formatUsd(context.totalCostUsd)} over ${turnCount(context.state)} turns`)

  const unpriced = context.usage.some((e) => e.model.inputPerMTok === 0)
  if (unpriced) {
    lines.push('', '  A model with no pricing in the registry was used - the total is a floor.')
  }
  lines.push(`  Estimated from rates last checked ${PRICING_VERIFIED_ON}.`)

  return lines.join('\n')
}

export function runCommand(line: string, context: CommandContext): CommandResult {
  const [name, ...rest] = line.trim().slice(1).split(/\s+/)
  const argument = line.trim().slice(1).slice(name.length).trim()
  const { state } = context

  switch (name) {
    case 'help':
    case '?':
      return { output: helpText() }

    case 'exit':
    case 'quit':
      return { output: 'Bye.', exit: true }

    case 'cost':
      return { output: costReport(context) }

    case 'clear':
      // Settings survive on purpose: /clear is for starting a new topic, and re-typing the system
      // prompt and model every time is exactly the friction that stops people using it.
      state.messages = []
      return { output: 'Conversation cleared. Model, temperature and system prompt kept.' }

    case 'model': {
      if (!argument) return { output: modelReport(state) }
      if (!isModelAlias(argument) && !argument.startsWith('claude-')) {
        return {
          output:
            `Unknown model "${argument}". Use one of ${MODEL_ALIASES.join(', ')}, ` +
            `or a full id starting with "claude-".`,
        }
      }
      state.model = argument
      const spec = resolveModel(argument)
      // The conversation carries over deliberately - switching mid-thread to escalate a hard
      // question is the main reason this command exists.
      return {
        output:
          `Model is now ${spec.id}.` +
          (spec.inputPerMTok === 0 ? ' No pricing on record, so /cost will under-report.' : ''),
      }
    }

    case 'temp':
    case 'temperature': {
      if (!argument) return { output: `Temperature is ${state.temperature}.` }
      const value = Number(argument)
      if (!Number.isFinite(value) || value < 0 || value > 1) {
        return { output: `Temperature must be between 0 and 1. Got "${argument}".` }
      }
      state.temperature = value
      const hint =
        value === 0
          ? ' Deterministic - right for extraction and classification.'
          : value >= 0.9
            ? ' High - varied, good for drafting, worse for anything you need to be repeatable.'
            : ''
      return { output: `Temperature is now ${value}.${hint}` }
    }

    case 'max-tokens': {
      if (!argument) return { output: `Max tokens is ${state.maxTokens}.` }
      const value = Number(argument)
      if (!Number.isInteger(value) || value < 1 || value > 64_000) {
        return { output: `Max tokens must be a whole number between 1 and 64000. Got "${argument}".` }
      }
      state.maxTokens = value
      return { output: `Max tokens is now ${value}.` }
    }

    case 'system': {
      if (!argument) return { output: state.system ? `System prompt:\n${state.system}` : 'No system prompt set.' }
      if (argument === 'reset') {
        state.system = createSession().system
        return { output: 'System prompt reset to the default.' }
      }
      if (argument === 'none') {
        state.system = undefined
        return { output: 'System prompt removed.' }
      }
      state.system = argument
      // Applies from the next turn on. The API sends `system` with every request, so this
      // retroactively reframes the existing history too - worth saying, because the effect on
      // earlier turns surprises people.
      return {
        output:
          `System prompt set (${argument.length} chars). It applies to the whole conversation, ` +
          `including the turns already in history.`,
      }
    }

    default:
      return { output: `Unknown command "/${name}". Try /help.`, ...(rest.length ? {} : {}) }
  }
}
