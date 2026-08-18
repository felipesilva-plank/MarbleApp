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
  /** Agent-loop guards. Exposed on the session so /limits can change them mid-conversation. */
  maxTurns: number
  maxCostUsd: number | null
}

export const DEFAULT_SYSTEM =
  'You are a concise assistant for the MarbleApp team. Prefer short, direct answers. ' +
  'When you are not sure, say so rather than guessing.\n\n' +
  'You have tools. Use calculator for ANY arithmetic rather than computing it yourself. ' +
  'Search and read before answering a question about the current state of the world, and cite ' +
  'the URL you took each claim from. Check list_notes before searching - the answer may already ' +
  'have been found and saved.'

export function createSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    messages: [],
    model: DEFAULT_MODEL,
    temperature: 1,
    maxTokens: 4096,
    system: DEFAULT_SYSTEM,
    maxTurns: 15,
    maxCostUsd: 1,
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
