/**
 * Retry policy for the Anthropic API.
 *
 * The SDK retries too, but its policy is invisible to the user - a 45-second pause with nothing on
 * screen reads as a hang. This wrapper exists mostly so retries can be *narrated*, and so the two
 * transient statuses that matter get the treatment they each deserve.
 */

export interface RetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  /** Narration hook. Called before each wait, never for the first attempt. */
  onRetry?: (info: { attempt: number; delayMs: number; reason: string }) => void
  sleep?: (ms: number) => Promise<void>
  /** Injected so tests are deterministic rather than jittery. */
  random?: () => number
}

/** 429 rate limit, 529 overloaded, 500/502/503/504 transient server errors. */
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504, 529])

export function statusOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const status = (error as { status?: unknown }).status
  return typeof status === 'number' ? status : undefined
}

export function isRetryable(error: unknown): boolean {
  const status = statusOf(error)
  if (status !== undefined) return RETRYABLE_STATUS.has(status)

  // A dropped socket has no status and is exactly the case worth retrying.
  const code = (error as { code?: unknown } | null)?.code
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'EPIPE'
}

/**
 * A 429 usually carries `retry-after`. Honouring it beats guessing: back off too little and you
 * extend the limit, too much and you idle. Values are clamped - a header saying 3600 is not
 * something to sit through in an interactive CLI.
 */
export function retryAfterMs(error: unknown, maxDelayMs: number): number | undefined {
  const headers = (error as { headers?: unknown } | null)?.headers
  if (!headers) return undefined

  const raw =
    typeof (headers as Headers).get === 'function'
      ? (headers as Headers).get('retry-after')
      : ((headers as Record<string, string>)['retry-after'] ??
        (headers as Record<string, string>)['Retry-After'])

  if (!raw) return undefined
  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds < 0) return undefined
  return Math.min(seconds * 1000, maxDelayMs)
}

export function backoffMs(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  random: () => number,
): number {
  const exponential = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs)
  // Full jitter. Without it, every client that hit the same limit retries in lockstep and
  // re-creates the burst that caused it.
  return Math.round(exponential * (0.5 + random() * 0.5))
}

export function describeError(error: unknown): string {
  const status = statusOf(error)
  if (status === 429) return 'rate limited (429)'
  if (status === 529) return 'API overloaded (529)'
  if (status !== undefined) return `HTTP ${status}`
  const code = (error as { code?: unknown } | null)?.code
  if (typeof code === 'string') return code
  return error instanceof Error ? error.message : String(error)
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 5,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    onRetry,
    sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
    random = Math.random,
  } = options

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      // Fail immediately on anything a retry cannot fix - a bad key, a malformed request. Sitting
      // through five backoffs to be told the same 400 is worse than being told once.
      if (!isRetryable(error) || attempt === maxAttempts) throw error

      const delayMs =
        retryAfterMs(error, maxDelayMs) ?? backoffMs(attempt, baseDelayMs, maxDelayMs, random)

      onRetry?.({ attempt, delayMs, reason: describeError(error) })
      await sleep(delayMs)
    }
  }

  throw lastError
}
