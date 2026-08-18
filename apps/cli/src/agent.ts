import type {
  ContentBlockParam,
  MessageParam,
  ToolUseBlock,
} from '@anthropic-ai/sdk/resources/messages'
import type { MarbleClient } from './client.js'
import { addUsage, costUsd, EMPTY_USAGE, formatUsd, resolveModel } from './models.js'
import type { Usage } from './models.js'
import type { RetryOptions } from './retry.js'
import { executeTools, toAnthropicTools, toolRegistry } from './tools/registry.js'
import type { Tool, ToolContext } from './tools/types.js'

/**
 * The agent loop: send → model asks for tools → run them → send results → repeat until it answers
 * in text.
 *
 * Three guards, because every one of them corresponds to a way this goes wrong in practice:
 * `maxTurns` (a model that keeps searching), `maxCostUsd` (a loop that is cheap per turn and
 * expensive over fifty), and an `AbortSignal` (a user who has seen enough).
 */

export interface AgentEvents {
  onText?: (delta: string) => void
  onToolStart?: (calls: Array<{ name: string; input: unknown }>) => void
  onToolEnd?: (results: Array<{ name: string; ok: boolean; ms: number }>) => void
  /** Fired when a guard stops the loop, so the caller can say why rather than just stopping. */
  onLimit?: (reason: string) => void
}

export interface AgentOptions {
  system?: string
  model?: string
  temperature?: number
  maxTokens?: number
  tools?: Tool[]
  maxTurns?: number
  /** Stop before a turn that would take the run past this. Null disables the check. */
  maxCostUsd?: number | null
  /** Passed through per turn, so a caller can narrate retries instead of sitting in silence. */
  retry?: RetryOptions
  events?: AgentEvents
}

export interface AgentResult {
  text: string
  messages: MessageParam[]
  usage: Usage
  costUsd: number
  turns: number
  toolCalls: number
  stoppedBecause: 'answered' | 'max_turns' | 'cost_limit' | 'aborted'
}

export async function runAgent(
  client: MarbleClient,
  messages: MessageParam[],
  toolContext: ToolContext,
  options: AgentOptions = {},
): Promise<AgentResult> {
  const {
    maxTurns = 15,
    maxCostUsd = 1,
    tools,
    events = {},
    retry,
    model,
    system,
    temperature,
    maxTokens,
  } = options

  const registry = toolRegistry(tools)
  const anthropicTools = toAnthropicTools(tools)
  const spec = resolveModel(model ?? 'sonnet')

  const history = [...messages]
  let usage = EMPTY_USAGE
  let turns = 0
  let toolCalls = 0
  let lastText = ''

  for (turns = 1; turns <= maxTurns; turns += 1) {
    if (toolContext.signal?.aborted) {
      return finish('aborted')
    }

    // Checked before the call, not after: knowing you have overspent once the money is gone is
    // not a limit, it is a receipt.
    if (maxCostUsd !== null && costUsd(spec, usage) >= maxCostUsd) {
      events.onLimit?.(
        `Stopped at ${formatUsd(costUsd(spec, usage))}, over the ${formatUsd(maxCostUsd)} limit for this run.`,
      )
      return finish('cost_limit')
    }

    const result = await client.askWithTools(history, anthropicTools, {
      model,
      system,
      temperature,
      maxTokens,
      signal: toolContext.signal,
      onText: events.onText,
      retry,
    })

    usage = addUsage(usage, result.usage)
    lastText = result.text || lastText
    history.push({ role: 'assistant', content: result.content })

    const toolUses = result.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use',
    )

    // No tool calls means it answered. This is the only successful exit.
    if (toolUses.length === 0) return finish('answered')

    toolCalls += toolUses.length
    events.onToolStart?.(toolUses.map((block) => ({ name: block.name, input: block.input })))

    const executed = await executeTools(toolUses, registry, toolContext)
    events.onToolEnd?.(executed.map(({ name, ok, ms }) => ({ name, ok, ms })))

    history.push({
      role: 'user',
      content: executed.map((entry) => entry.block) as ContentBlockParam[],
    })
  }

  events.onLimit?.(
    `Stopped after ${maxTurns} turns without a final answer. Narrow the question, or raise --max-turns.`,
  )
  return finish('max_turns')

  function finish(stoppedBecause: AgentResult['stoppedBecause']): AgentResult {
    return {
      text: lastText,
      messages: history,
      usage,
      costUsd: costUsd(spec, usage),
      turns: Math.min(turns, maxTurns),
      toolCalls,
      stoppedBecause,
    }
  }
}
