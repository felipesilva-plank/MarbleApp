import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { DEFAULT_MODEL } from './models.js'

/**
 * Conversation state, kept separate from the REPL so it is testable without a terminal.
 *
 * Everything that a slash command can change lives here, which is also why the commands
 * themselves are pure functions over this object rather than closures over the readline loop.
 */

export interface SessionState {
  messages: MessageParam[]
  model: string
  temperature: number
  maxTokens: number
  system: string | undefined
}

export const DEFAULT_SYSTEM =
  'You are a concise assistant for the MarbleApp team. Prefer short, direct answers. ' +
  'When you are not sure, say so rather than guessing.'

export function createSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    messages: [],
    model: DEFAULT_MODEL,
    temperature: 1,
    maxTokens: 4096,
    system: DEFAULT_SYSTEM,
    ...overrides,
  }
}

export function addUser(state: SessionState, text: string): void {
  state.messages.push({ role: 'user', content: text })
}

export function addAssistant(state: SessionState, text: string): void {
  state.messages.push({ role: 'assistant', content: text })
}

/**
 * Drop the last exchange. Used when a request fails: leaving a user turn with no assistant reply
 * in the history means the next request sends two user messages in a row, which the API rejects -
 * so a single network blip would poison the whole session.
 */
export function rollbackLastUser(state: SessionState): void {
  const last = state.messages.at(-1)
  if (last?.role === 'user') state.messages.pop()
}

export function turnCount(state: SessionState): number {
  return state.messages.filter((m) => m.role === 'user').length
}
