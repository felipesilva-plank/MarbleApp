import { DomainError } from '../errors'

/**
 * Structured records live in localStorage: small, synchronous, and trivially inspectable in
 * devtools, which matters a lot while the app has no backend. Photos do NOT live here — see
 * photos.ts for why.
 */

const NS = 'marble.v1'

export const KEYS = {
  users: `${NS}.users`,
  session: `${NS}.session`,
  pieces: `${NS}.pieces`,
  materials: `${NS}.materials`,
  counters: `${NS}.counters`,
  presets: `${NS}.presets`,
  seeded: `${NS}.seeded`,
} as const

/** Single implicit tenant. Exists as a field so the future multi-org backend needs no migration. */
export const ORG_ID = 'org_local'

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    // Corrupt or hand-edited value: fall back rather than bricking the whole app.
    return fallback
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    if (isQuotaError(error)) {
      throw new DomainError(
        'QUOTA',
        'Browser storage is full. Export a backup from Settings, then remove some pieces or photos.',
      )
    }
    throw error
  }
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

export function newId(): string {
  // randomUUID needs a secure context; every real deployment target (https, localhost) has one.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export function nowIso(): string {
  return new Date().toISOString()
}
