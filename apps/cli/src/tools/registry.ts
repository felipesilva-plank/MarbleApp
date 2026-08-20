import type { Tool as AnthropicTool, ToolResultBlockParam, ToolUseBlock } from '@anthropic-ai/sdk/resources/messages'
import { calculatorTool } from './calculator.js'
import { listNotesTool, saveNoteTool } from './notes.js'
import { ToolError } from './types.js'
import type { Tool, ToolContext } from './types.js'
import { readUrlTool, webSearchTool } from './web.js'

export const ALL_TOOLS: Tool[] = [
  webSearchTool,
  readUrlTool,
  calculatorTool,
  saveNoteTool,
  listNotesTool,
]

export function toolRegistry(tools: Tool[] = ALL_TOOLS): Map<string, Tool> {
  return new Map(tools.map((tool) => [tool.name, tool]))
}

export function toAnthropicTools(tools: Tool[] = ALL_TOOLS): AnthropicTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }))
}

export interface ExecutedTool {
  block: ToolResultBlockParam
  name: string
  ok: boolean
  /** Wall time, so a slow tool is visible rather than being blamed on the model. */
  ms: number
}

/**
 * Run one tool call, converting every outcome into a `tool_result` block.
 *
 * A thrown error must never escape: the API requires a result block for every `tool_use` id in the
 * previous message, so an unhandled throw leaves the conversation permanently malformed. Failures
 * come back as `is_error: true` with a message the model can act on.
 */
export async function executeTool(
  block: ToolUseBlock,
  registry: Map<string, Tool>,
  context: ToolContext,
): Promise<ExecutedTool> {
  const started = Date.now()
  const tool = registry.get(block.name)

  const result = (content: string, ok: boolean): ExecutedTool => ({
    block: { type: 'tool_result', tool_use_id: block.id, content, ...(ok ? {} : { is_error: true }) },
    name: block.name,
    ok,
    ms: Date.now() - started,
  })

  if (!tool) {
    return result(
      `No tool named "${block.name}". Available: ${[...registry.keys()].join(', ')}.`,
      false,
    )
  }

  try {
    const output = await tool.run((block.input ?? {}) as Record<string, unknown>, context)
    return result(output, true)
  } catch (error) {
    if (error instanceof ToolError) return result(error.message, false)
    if (error instanceof Error && error.name === 'AbortError') {
      return result('Cancelled by the user.', false)
    }
    // An unexpected throw is a bug in the tool, not something the model did. Say which tool, so
    // the transcript is diagnosable, and let it try a different approach.
    return result(
      `${block.name} failed unexpectedly: ${error instanceof Error ? error.message : String(error)}`,
      false,
    )
  }
}

/**
 * Run every tool call from one assistant turn concurrently.
 *
 * Claude routinely emits several `tool_use` blocks in a single message. Running them in sequence
 * makes three 800 ms searches a 2.4 s turn for no reason. Order in the returned array matches the
 * input, which the API does not require but makes transcripts readable.
 */
export async function executeTools(
  blocks: ToolUseBlock[],
  registry: Map<string, Tool>,
  context: ToolContext,
): Promise<ExecutedTool[]> {
  return Promise.all(blocks.map((block) => executeTool(block, registry, context)))
}
