import type { Tool as AnthropicTool } from '@anthropic-ai/sdk/resources/messages'

/**
 * A tool the model can call.
 *
 * `run` returns a string rather than an object because that string is what the model reads. Which
 * makes the error path the interesting part: `ToolError` messages are written to tell the model
 * what to do next, not to describe what went wrong. "No results for 'xyz'. Try fewer or broader
 * terms." moves it forward; "Error: 404" makes it give up or repeat itself.
 */
export interface ToolContext {
  /** Injected so tests never touch the network. */
  fetch: typeof fetch
  /** Where save_note writes. */
  notesPath: string
  /**
   * Asked before running a tool with `needsConfirmation`. Returning false is a refusal, not a
   * failure - the model is told so and can carry on without it.
   */
  confirm?: (tool: string, input: unknown) => Promise<boolean>
  signal?: AbortSignal
}

export interface Tool {
  name: string
  description: string
  inputSchema: AnthropicTool['input_schema']
  /** Tools with side effects outside this process pause the loop for a yes/no. */
  needsConfirmation?: boolean
  run(input: Record<string, unknown>, context: ToolContext): Promise<string>
}

/** A failure the model should read and act on, as opposed to a bug in the tool. */
export class ToolError extends Error {}

export function requireString(
  input: Record<string, unknown>,
  key: string,
  { max }: { max?: number } = {},
): string {
  const value = input[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ToolError(`"${key}" is required and must be a non-empty string.`)
  }
  if (max !== undefined && value.length > max) {
    throw new ToolError(`"${key}" must be at most ${max} characters. Shorten it and retry.`)
  }
  return value.trim()
}

export function optionalNumber(
  input: Record<string, unknown>,
  key: string,
  fallback: number,
  { min, max }: { min: number; max: number },
): number {
  const value = input[key]
  if (value === undefined || value === null) return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) throw new ToolError(`"${key}" must be a number.`)
  return Math.min(Math.max(parsed, min), max)
}
