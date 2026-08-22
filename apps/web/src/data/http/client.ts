import { DomainError, isDomainErrorCode } from '@marble/core'

/**
 * The one place the web app talks to the network.
 *
 * Two responsibilities. It sends the session cookie — `credentials: 'include'` on every call,
 * because the API and the app are separate deployments and a cross-origin request drops cookies
 * unless it opts in. And it turns the API's error body back into the same `DomainError` the
 * server threw, so a component branching on `error.code === 'HAS_CHILDREN'` reads identically to
 * the service that raised it.
 */

/**
 * Where the API lives. Set `VITE_API_URL` at build time; the default is the port `apps/api`
 * listens on in development. A trailing slash would produce `//api/pieces`, so it is trimmed.
 */
export const API_URL = (
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001'
).replace(/\/$/, '')

interface ApiErrorBody {
  error?: { code?: string; message?: string }
}

async function toDomainError(response: Response): Promise<DomainError> {
  let body: ApiErrorBody | null = null
  try {
    body = (await response.json()) as ApiErrorBody
  } catch {
    // A proxy or a crashed process can answer with HTML, or with nothing at all.
  }

  const code = body?.error?.code
  const message = body?.error?.message

  if (isDomainErrorCode(code) && message) return new DomainError(code, message)

  // An unrecognised failure is still shown to a person, so it gets a sentence rather than a status.
  if (response.status >= 500) {
    return new DomainError('VALIDATION', 'The server had a problem with that. Please try again.')
  }
  return new DomainError('VALIDATION', message ?? 'That request could not be completed.')
}

export async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, credentials: 'include' })
  } catch {
    // fetch only rejects when the request never got an answer: no network, DNS failure, the API
    // not running, or CORS refusing it. That is worth saying plainly rather than as a generic error.
    throw new DomainError(
      'OFFLINE',
      'Could not reach the server. Check your connection and try again.',
    )
  }

  if (!response.ok) throw await toDomainError(response)
  return response
}

export async function apiGet<T>(path: string): Promise<T> {
  return (await request(path)).json() as Promise<T>
}

export async function apiSend<T>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await request(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

/** Drops empty values so `?kind=` never reaches the server meaning "the empty kind". */
export function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}
