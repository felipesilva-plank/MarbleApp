/**
 * Model registry and pricing.
 *
 * Pricing lives in code rather than being looked up, so `/cost` works offline and so the numbers
 * are reviewable in a diff. It is therefore also a thing that goes stale - `verifiedOn` says when
 * it was last checked against the pricing page, and the cost report says so out loud rather than
 * presenting a stale number as fact.
 */

export type ModelAlias = 'opus' | 'sonnet' | 'haiku'

export interface ModelSpec {
  alias: ModelAlias
  id: string
  /** USD per million input tokens. */
  inputPerMTok: number
  /** USD per million output tokens. */
  outputPerMTok: number
  /** What it is actually for - shown by /model so the choice is informed. */
  bestFor: string
}

/** Last checked against https://www.anthropic.com/pricing on this date. */
export const PRICING_VERIFIED_ON = '2026-08-17'

export const MODELS: Record<ModelAlias, ModelSpec> = {
  opus: {
    alias: 'opus',
    id: 'claude-opus-4-1-20250805',
    inputPerMTok: 15,
    outputPerMTok: 75,
    bestFor: 'Hard reasoning, ambiguous specs, long multi-step work. Slowest and dearest.',
  },
  sonnet: {
    alias: 'sonnet',
    id: 'claude-sonnet-4-5-20250929',
    inputPerMTok: 3,
    outputPerMTok: 15,
    bestFor: 'The default. Balanced quality and speed; good at code and synthesis.',
  },
  haiku: {
    alias: 'haiku',
    id: 'claude-haiku-4-5-20251001',
    inputPerMTok: 1,
    outputPerMTok: 5,
    bestFor: 'Classification, extraction, query generation. Fast and cheap enough to use in bulk.',
  },
}

export const MODEL_ALIASES = Object.keys(MODELS) as ModelAlias[]

export const DEFAULT_MODEL: ModelAlias = 'sonnet'

export function isModelAlias(value: string): value is ModelAlias {
  return value in MODELS
}

/**
 * Accepts an alias or a full model id, so `--model claude-haiku-4-5-20251001` works. An unknown
 * full id resolves to a spec with zero pricing rather than failing: the API is the authority on
 * which ids exist, and refusing here would mean this registry has to be updated before a new model
 * can be tried.
 */
export function resolveModel(value: string): ModelSpec {
  if (isModelAlias(value)) return MODELS[value]

  const known = Object.values(MODELS).find((m) => m.id === value)
  if (known) return known

  return {
    alias: 'sonnet',
    id: value,
    inputPerMTok: 0,
    outputPerMTok: 0,
    bestFor: 'Unknown model id - passed through to the API. Cost cannot be estimated.',
  }
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

export const EMPTY_USAGE: Usage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheCreationTokens: 0,
  cacheReadTokens: 0,
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  }
}

/**
 * Cache writes cost 25% more than input, cache reads 90% less. Folding them into plain input
 * would make caching look free, and then nobody notices when it stops working.
 */
export function costUsd(spec: ModelSpec, usage: Usage): number {
  const input = (usage.inputTokens / 1_000_000) * spec.inputPerMTok
  const cacheWrite = (usage.cacheCreationTokens / 1_000_000) * spec.inputPerMTok * 1.25
  const cacheRead = (usage.cacheReadTokens / 1_000_000) * spec.inputPerMTok * 0.1
  const output = (usage.outputTokens / 1_000_000) * spec.outputPerMTok
  return input + cacheWrite + cacheRead + output
}

/** Sub-cent costs are the normal case here, so two decimal places would read as always zero. */
export function formatUsd(amount: number): string {
  if (amount === 0) return '$0.00'
  if (amount < 0.01) return `$${amount.toFixed(4)}`
  return `$${amount.toFixed(2)}`
}

export function formatTokens(count: number): string {
  if (count < 1000) return String(count)
  return `${(count / 1000).toFixed(1)}k`
}
