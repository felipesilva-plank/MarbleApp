import { MODEL_ALIASES } from './models.js'

/**
 * Argument parsing, kept dependency-free. The flag set is small enough that a library would be
 * more surface area than it removes.
 */

export interface ParsedArgs {
  model?: string
  temperature?: number
  maxTokens?: number
  system?: string
  /** Non-flag words: a first prompt to send before the REPL takes over. */
  prompt?: string
  help: boolean
  errors: string[]
}

export const USAGE = `
marble chat - a CLI chatbot over the Anthropic API

  npm run chat -- [options] [prompt...]

Options
  -m, --model <${MODEL_ALIASES.join('|')}|id>   model to start with (default: sonnet)
  -t, --temperature <0-1>              sampling temperature (default: 1)
      --max-tokens <n>                 response cap (default: 4096)
  -s, --system <text>                  system prompt
  -h, --help                           this text

Any trailing words are sent as a first message; the REPL then continues from there.

Requires ANTHROPIC_API_KEY in the environment or .env.local.
`.trim()

function number(raw: string | undefined, flag: string, errors: string[]): number | undefined {
  if (raw === undefined) {
    errors.push(`${flag} needs a value.`)
    return undefined
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    errors.push(`${flag} expects a number, got "${raw}".`)
    return undefined
  }
  return value
}

export function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = { help: false, errors: [] }
  const words: string[] = []

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const next = () => argv[(i += 1)]

    switch (arg) {
      case '-h':
      case '--help':
        parsed.help = true
        break

      case '-m':
      case '--model': {
        const value = next()
        if (value === undefined) parsed.errors.push('--model needs a value.')
        else parsed.model = value
        break
      }

      case '-t':
      case '--temperature': {
        const value = number(next(), '--temperature', parsed.errors)
        if (value !== undefined) {
          if (value < 0 || value > 1) parsed.errors.push('--temperature must be between 0 and 1.')
          else parsed.temperature = value
        }
        break
      }

      case '--max-tokens': {
        const value = number(next(), '--max-tokens', parsed.errors)
        if (value !== undefined) {
          if (!Number.isInteger(value) || value < 1) {
            parsed.errors.push('--max-tokens must be a positive whole number.')
          } else parsed.maxTokens = value
        }
        break
      }

      case '-s':
      case '--system': {
        const value = next()
        if (value === undefined) parsed.errors.push('--system needs a value.')
        else parsed.system = value
        break
      }

      default:
        // An unrecognised dash-flag is a typo, not a prompt. Silently treating --modle as the
        // first message is the kind of thing you notice three turns later.
        if (arg.startsWith('-') && arg.length > 1) parsed.errors.push(`Unknown option "${arg}".`)
        else words.push(arg)
    }
  }

  if (words.length > 0) parsed.prompt = words.join(' ')
  return parsed
}
