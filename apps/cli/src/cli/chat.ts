/**
 * The REPL.
 *
 * Everything with logic in it lives in ../commands.ts, ../session.ts and ../args.ts so it can be
 * tested without a terminal. What is left here is genuinely terminal-shaped: readline, signal
 * handling, and writing bytes.
 */
import { createInterface } from 'node:readline/promises'
import { stdin, stdout, stderr } from 'node:process'
import { join } from 'node:path'
import { runAgent } from '../agent.js'
import { MarbleClient, MissingApiKeyError } from '../client.js'
import { isCommand, runCommand } from '../commands.js'
import { formatUsd, resolveModel } from '../models.js'
import { parseArgs, USAGE } from '../args.js'
import { addAssistant, addUser, createSession, rollbackLastUser } from '../session.js'
import { ALL_TOOLS } from '../tools/registry.js'
import type { ToolContext } from '../tools/types.js'

const args = parseArgs(process.argv.slice(2))

if (args.help) {
  stdout.write(`${USAGE}\n`)
  process.exit(0)
}

if (args.errors.length > 0) {
  stderr.write(`${args.errors.join('\n')}\n\nRun with --help.\n`)
  process.exit(1)
}

let client: MarbleClient
try {
  client = new MarbleClient({ defaultModel: args.model })
} catch (error) {
  stderr.write(`${error instanceof MissingApiKeyError ? error.message : String(error)}\n`)
  process.exit(1)
}

const state = createSession({
  ...(args.model ? { model: args.model } : {}),
  ...(args.temperature !== undefined ? { temperature: args.temperature } : {}),
  ...(args.maxTokens !== undefined ? { maxTokens: args.maxTokens } : {}),
  ...(args.system !== undefined ? { system: args.system } : {}),
})

const rl = createInterface({ input: stdin, output: stdout })

const NOTES_PATH = process.env.MARBLE_NOTES_PATH ?? join(process.cwd(), '.marble-notes.json')

/**
 * Confirmation for tools that write. Reads from the same readline instance, which is why it is
 * here and not inside the tool: the tool should not know what a terminal is.
 */
async function confirmToolCall(tool: string, input: unknown): Promise<boolean> {
  const summary = JSON.stringify(input, null, 2)
  stdout.write(`\n  ${tool} wants to write:\n${summary.split('\n').map((l) => `    ${l}`).join('\n')}\n`)
  const answer = (await rl.question('  allow? [y/N] ')).trim().toLowerCase()
  return answer === 'y' || answer === 'yes'
}

/** Set while a reply is streaming, so Ctrl-C cancels the request instead of killing the process. */
let inFlight: AbortController | null = null

rl.on('SIGINT', () => {
  if (inFlight) {
    inFlight.abort()
    stdout.write('\n(cancelled)\n')
    return
  }
  stdout.write('\n')
  rl.close()
})

function commandContext() {
  return { state, usage: client.sessionUsage(), totalCostUsd: client.sessionCostUsd() }
}

async function send(text: string): Promise<void> {
  addUser(state, text)

  inFlight = new AbortController()

  const toolContext: ToolContext = {
    fetch: globalThis.fetch,
    notesPath: NOTES_PATH,
    confirm: confirmToolCall,
    signal: inFlight.signal,
  }

  try {
    const result = await runAgent(client, state.messages, toolContext, {
      model: state.model,
      temperature: state.temperature,
      maxTokens: state.maxTokens,
      system: state.system,
      tools: ALL_TOOLS,
      maxTurns: state.maxTurns,
      maxCostUsd: state.maxCostUsd,
      events: {
        onToolStart: (calls) => {
          for (const call of calls) {
            const preview = JSON.stringify(call.input)
            stdout.write(
              `\n  → ${call.name}(${preview.length > 90 ? `${preview.slice(0, 87)}…` : preview})\n`,
            )
          }
        },
        onToolEnd: (results) => {
          for (const r of results) {
            stdout.write(`  ${r.ok ? '✓' : '✗'} ${r.name} (${r.ms}ms)\n`)
          }
        },
        onLimit: (reason) => stderr.write(`\n[${reason}]\n`),
      },
    })

    addAssistant(state, result.text)
    stdout.write(`${result.text}\n`)

    stderr.write(
      `[${resolveModel(state.model).alias} · ${result.turns} turn${result.turns === 1 ? '' : 's'}` +
        `${result.toolCalls > 0 ? ` · ${result.toolCalls} tool calls` : ''}` +
        ` · ${result.usage.inputTokens} in / ${result.usage.outputTokens} out` +
        ` · ${formatUsd(result.costUsd)} · ${formatUsd(client.sessionCostUsd())} session]\n`,
    )
  } catch (error) {
    // A user turn with no assistant reply means the next request sends two user messages in a row,
    // which the API rejects - so one blip would otherwise poison the whole session.
    rollbackLastUser(state)

    const aborted = error instanceof Error && error.name === 'AbortError'
    if (!aborted) {
      stderr.write(`\n${error instanceof Error ? error.message : String(error)}\n`)
    }
  } finally {
    inFlight = null
  }
}

stdout.write(
  `marble chat · ${resolveModel(state.model).id} · temp ${state.temperature}\n` +
    `/help for commands, /exit to quit.\n\n`,
)

if (args.prompt) {
  stdout.write(`> ${args.prompt}\n`)
  await send(args.prompt)
}

/**
 * The async iterator rather than rl.question(): readline pauses the stream between iterations, so
 * awaiting inside the loop is safe, and unlike question() it behaves identically when stdin is a
 * pipe rather than a TTY. That matters for `echo '/help' | npm run chat` and for the smoke test.
 */
stdout.write('> ')

for await (const raw of rl) {
  const line = raw.trim()

  if (line !== '') {
    if (isCommand(line)) {
      const result = runCommand(line, commandContext())
      stdout.write(`${result.output}\n`)
      if (result.exit) break
    } else {
      await send(line)
    }
  }

  stdout.write('\n> ')
}

rl.close()
stdout.write('\n')

const total = client.sessionCostUsd()
if (total > 0) stdout.write(`\nSession cost: ${formatUsd(total)}\n`)
