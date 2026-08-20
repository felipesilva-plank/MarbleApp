/**
 * How close this browser is to losing the user's inventory.
 *
 * localStorage caps near 5 MB and throws mid-write when it fills, so knowing the number before
 * that happens is the difference between "export a backup now" and "the save silently failed".
 * Records and photos are measured separately because they live in different stores with wildly
 * different ceilings, and photos are what actually grows.
 */

const LOCALSTORAGE_BUDGET_BYTES = 5 * 1024 * 1024

export interface StorageUsage {
  /** Bytes of localStorage used by this app's keys only, not the whole origin. */
  recordBytes: number
  /** Bytes reported by the Storage API for the whole origin - IndexedDB photos dominate it. */
  originBytes: number | null
  /** Origin quota, when the browser will say. */
  originQuotaBytes: number | null
  /** recordBytes as a fraction of the ~5 MB localStorage ceiling, clamped to 1. */
  recordFraction: number
}

/**
 * UTF-16 code units, which is what browsers actually bill localStorage in - a 2-byte-per-char
 * approximation is closer than `Blob.size` for the ASCII-heavy JSON this app writes.
 */
export function measureLocalStorage(prefix: string, store: Storage): number {
  let bytes = 0
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i)
    if (key === null || !key.startsWith(prefix)) continue
    const value = store.getItem(key) ?? ''
    bytes += (key.length + value.length) * 2
  }
  return bytes
}

export async function storageUsage(prefix = 'marble.'): Promise<StorageUsage> {
  const recordBytes =
    typeof localStorage === 'undefined' ? 0 : measureLocalStorage(prefix, localStorage)

  let originBytes: number | null = null
  let originQuotaBytes: number | null = null

  // Not in Safari before 17, and absent in jsdom. Missing numbers are rendered as "—" rather
  // than guessed at.
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate()
      originBytes = estimate.usage ?? null
      originQuotaBytes = estimate.quota ?? null
    } catch {
      // Permission-gated in some browsers. Not worth surfacing an error over.
    }
  }

  return {
    recordBytes,
    originBytes,
    originQuotaBytes,
    recordFraction: Math.min(recordBytes / LOCALSTORAGE_BUDGET_BYTES, 1),
  }
}

export function formatBytes(bytes: number | null): string {
  if (bytes === null || Number.isNaN(bytes)) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['kB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

export { LOCALSTORAGE_BUDGET_BYTES }
