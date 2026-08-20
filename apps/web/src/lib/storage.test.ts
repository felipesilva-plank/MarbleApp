import { describe, expect, it } from 'vitest'
import { formatBytes, measureLocalStorage, storageUsage } from './storage'

/** Minimal Storage stand-in: jsdom's localStorage is shared across the whole suite. */
function fakeStore(entries: Record<string, string>): Storage {
  const keys = Object.keys(entries)
  return {
    length: keys.length,
    key: (i: number) => keys[i] ?? null,
    getItem: (k: string) => entries[k] ?? null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
  } as unknown as Storage
}

describe('measureLocalStorage', () => {
  it('counts key and value as UTF-16, which is how browsers bill it', () => {
    // 'marble.a' (8) + 'xy' (2) = 10 code units = 20 bytes
    expect(measureLocalStorage('marble.', fakeStore({ 'marble.a': 'xy' }))).toBe(20)
  })

  it('ignores keys belonging to other apps on the same origin', () => {
    const store = fakeStore({ 'marble.a': 'xy', 'other.big': 'x'.repeat(1000) })
    expect(measureLocalStorage('marble.', store)).toBe(20)
  })

  it('is zero when the app has written nothing', () => {
    expect(measureLocalStorage('marble.', fakeStore({}))).toBe(0)
  })
})

describe('storageUsage', () => {
  it('reports null rather than guessing when the Storage API is unavailable', async () => {
    const usage = await storageUsage('marble.')
    // jsdom ships no navigator.storage.estimate; the UI renders these as em dashes.
    expect(usage.originBytes).toBeNull()
    expect(usage.originQuotaBytes).toBeNull()
    expect(usage.recordFraction).toBeGreaterThanOrEqual(0)
    expect(usage.recordFraction).toBeLessThanOrEqual(1)
  })
})

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [512, '512 B'],
    [2048, '2.0 kB'],
    [20480, '20 kB'],
    [5 * 1024 * 1024, '5.0 MB'],
  ])('formats %i as %s', (input, expected) => {
    expect(formatBytes(input)).toBe(expected)
  })

  it('renders an unknown size as an em dash', () => {
    expect(formatBytes(null)).toBe('—')
  })
})
