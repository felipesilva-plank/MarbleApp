import { describe, expect, it, vi } from 'vitest'
import { backoffMs, describeError, isRetryable, retryAfterMs, withRetry } from './retry.js'

function apiError(status: number, headers?: Record<string, string>) {
  return Object.assign(new Error(`HTTP ${status}`), { status, headers })
}

const noSleep = async () => undefined

describe('isRetryable', () => {
  it.each([429, 529, 500, 502, 503, 504, 408, 409])('retries %i', (status) => {
    expect(isRetryable(apiError(status))).toBe(true)
  })

  it.each([400, 401, 403, 404, 422])('does not retry %i', (status) => {
    expect(isRetryable(apiError(status))).toBe(false)
  })

  it('retries a dropped socket, which carries no status', () => {
    expect(isRetryable(Object.assign(new Error('reset'), { code: 'ECONNRESET' }))).toBe(true)
  })

  it('does not retry an ordinary error', () => {
    expect(isRetryable(new Error('boom'))).toBe(false)
  })
})

describe('retryAfterMs', () => {
  it('honours the header rather than guessing', () => {
    expect(retryAfterMs(apiError(429, { 'retry-after': '7' }), 30_000)).toBe(7000)
  })

  it('reads a Headers object as well as a plain record', () => {
    const error = Object.assign(new Error('x'), {
      status: 429,
      headers: new Headers({ 'retry-after': '3' }),
    })
    expect(retryAfterMs(error, 30_000)).toBe(3000)
  })

  it('clamps an absurd value - nobody waits an hour in an interactive CLI', () => {
    expect(retryAfterMs(apiError(429, { 'retry-after': '3600' }), 30_000)).toBe(30_000)
  })

  it('ignores a non-numeric value', () => {
    expect(retryAfterMs(apiError(429, { 'retry-after': 'soon' }), 30_000)).toBeUndefined()
  })

  it('is undefined when the header is absent', () => {
    expect(retryAfterMs(apiError(429), 30_000)).toBeUndefined()
  })
})

describe('backoffMs', () => {
  it('grows exponentially', () => {
    const full = () => 1 // no jitter reduction
    expect(backoffMs(1, 1000, 30_000, full)).toBe(1000)
    expect(backoffMs(2, 1000, 30_000, full)).toBe(2000)
    expect(backoffMs(3, 1000, 30_000, full)).toBe(4000)
  })

  it('caps at the maximum', () => {
    expect(backoffMs(20, 1000, 30_000, () => 1)).toBe(30_000)
  })

  it('applies full jitter, so clients that hit one limit do not retry in lockstep', () => {
    expect(backoffMs(3, 1000, 30_000, () => 0)).toBe(2000)
    expect(backoffMs(3, 1000, 30_000, () => 1)).toBe(4000)
  })
})

describe('describeError', () => {
  it('names 429 and 529 specifically, since they mean different things', () => {
    expect(describeError(apiError(429))).toBe('rate limited (429)')
    expect(describeError(apiError(529))).toBe('API overloaded (529)')
  })

  it('falls back to the status, then the code, then the message', () => {
    expect(describeError(apiError(503))).toBe('HTTP 503')
    expect(describeError(Object.assign(new Error('x'), { code: 'ETIMEDOUT' }))).toBe('ETIMEDOUT')
    expect(describeError(new Error('plain'))).toBe('plain')
  })
})

describe('withRetry', () => {
  it('returns the first success without sleeping', async () => {
    const onRetry = vi.fn()
    await expect(withRetry(async () => 'ok', { onRetry, sleep: noSleep })).resolves.toBe('ok')
    expect(onRetry).not.toHaveBeenCalled()
  })

  it('retries a 529 and then succeeds', async () => {
    let calls = 0
    const result = await withRetry(
      async () => {
        calls += 1
        if (calls < 3) throw apiError(529)
        return 'ok'
      },
      { sleep: noSleep, random: () => 0.5 },
    )
    expect(result).toBe('ok')
    expect(calls).toBe(3)
  })

  it('fails immediately on a 400 - five backoffs cannot fix a bad request', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls += 1
          throw apiError(400)
        },
        { sleep: noSleep },
      ),
    ).rejects.toMatchObject({ status: 400 })
    expect(calls).toBe(1)
  })

  it('gives up after maxAttempts and rethrows the last error', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls += 1
          throw apiError(429)
        },
        { maxAttempts: 3, sleep: noSleep, random: () => 0.5 },
      ),
    ).rejects.toMatchObject({ status: 429 })
    expect(calls).toBe(3)
  })

  it('narrates each retry so a long wait does not read as a hang', async () => {
    const onRetry = vi.fn()
    let calls = 0
    await withRetry(
      async () => {
        calls += 1
        if (calls === 1) throw apiError(429, { 'retry-after': '2' })
        return 'ok'
      },
      { onRetry, sleep: noSleep, random: () => 0.5 },
    )
    expect(onRetry).toHaveBeenCalledWith({
      attempt: 1,
      delayMs: 2000,
      reason: 'rate limited (429)',
    })
  })

  it('waits the retry-after value in preference to its own backoff', async () => {
    const slept: number[] = []
    let calls = 0
    await withRetry(
      async () => {
        calls += 1
        if (calls === 1) throw apiError(429, { 'retry-after': '9' })
        return 'ok'
      },
      {
        sleep: async (ms) => {
          slept.push(ms)
        },
        random: () => 0.5,
      },
    )
    expect(slept).toEqual([9000])
  })
})
