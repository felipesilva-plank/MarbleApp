import { createApp } from '../app.ts'
import { setPhotoStore } from '../photos/store.ts'
import type { PhotoStore, StoredPhoto } from '../photos/store.ts'

/**
 * A thin client over `app.request()` — a real Hono app, no socket, no mocks below it.
 *
 * It carries the session cookie the way a browser would, because the cookie *is* the auth
 * mechanism: a test that passed a user id around would prove nothing about whether the middleware
 * actually guards anything.
 */
export class TestClient {
  private readonly app = createApp()
  private cookie: string | null = null

  async request(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    if (this.cookie) headers.set('Cookie', this.cookie)

    const response = await this.app.request(path, { ...init, headers })

    const setCookie = response.headers.get('set-cookie')
    if (setCookie) {
      const value = setCookie.split(';')[0]
      this.cookie = value.endsWith('=') ? null : value
    }
    return response
  }

  json(path: string, method: string, body?: unknown): Promise<Response> {
    return this.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  /** Asserts a 2xx and unwraps the body. Use `request` directly when the failure is the point. */
  async ok<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await this.json(path, method, body)
    if (!response.ok) {
      const detail = await response.text()
      throw new Error(`${method} ${path} → ${response.status}: ${detail}`)
    }
    return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
  }

  /** The error body for a call expected to fail. */
  async failure(path: string, method = 'GET', body?: unknown) {
    const response = await this.json(path, method, body)
    const payload = (await response.json()) as { error: { code: string; message: string } }
    return { status: response.status, ...payload.error }
  }

  signedOut(): void {
    this.cookie = null
  }
}

/** An in-memory photo store, so the suite never writes to disk or reaches for a bucket. */
export function useMemoryPhotoStore(): Map<string, StoredPhoto> {
  const files = new Map<string, StoredPhoto>()
  const store: PhotoStore = {
    async put(orgId, pieceId, bytes, contentType) {
      files.set(`${orgId}/${pieceId}`, { bytes, contentType })
    },
    async get(orgId, pieceId) {
      return files.get(`${orgId}/${pieceId}`) ?? null
    },
    async remove(orgId, pieceId) {
      files.delete(`${orgId}/${pieceId}`)
    },
  }
  setPhotoStore(store)
  return files
}

export interface Registration {
  client: TestClient
  user: { id: string; orgId: string; email: string; name: string; role: string }
}

let counter = 0

/** Registers a shop and returns a client already holding its session. */
export async function signUp(orgName = 'Test Stoneworks'): Promise<Registration> {
  const client = new TestClient()
  counter += 1
  const { user } = await client.ok<{ user: Registration['user'] }>(
    '/api/auth/register',
    'POST',
    {
      name: 'Test Owner',
      orgName,
      email: `owner${counter}@test.dev`,
      password: 'stoneyard2026',
    },
  )
  return { client, user }
}
