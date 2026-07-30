import type { LoginInput, RegisterInput, User } from '@marble/core'
import { DomainError } from '../errors'
import type { AuthPort } from '../ports'
import { ORG_ID, newId, nowIso } from './db'
import { clearSession, currentUserSync, readUsers, writeSession, writeUsers } from './session'

/**
 * ⚠️  THIS IS A UI GATE, NOT SECURITY.
 *
 * Everything runs in the browser, so anyone with devtools can read every record and edit the
 * user list directly. Passwords are hashed with PBKDF2 anyway for one reason: the hashing code,
 * the stored shape (salt + derived hash, never plaintext), and the session flow are exactly what
 * moves to the Fastify backend, so the migration is a relocation rather than a rewrite.
 *
 * Do not put a real customer's inventory in this until the API exists.
 */

const PBKDF2_ITERATIONS = 100_000
const SESSION_DAYS = 7

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function assertCrypto(): void {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new DomainError(
      'BAD_CREDENTIALS',
      'Secure crypto is unavailable. Open the app over https or on localhost.',
    )
  }
}

async function derive(password: string, salt: Uint8Array): Promise<string> {
  assertCrypto()
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

function startSession(userId: string): void {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString()
  writeSession({ userId, expiresAt })
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const localAuthPort: AuthPort = {
  async register(input: RegisterInput): Promise<User> {
    const users = readUsers()
    const email = normalizeEmail(input.email)

    if (users.some((u) => u.email === email)) {
      throw new DomainError('EMAIL_TAKEN', 'An account with that email already exists.')
    }

    const salt = crypto.getRandomValues(new Uint8Array(16))
    const user: User = {
      id: newId(),
      orgId: ORG_ID,
      email,
      name: input.name.trim(),
      passwordHash: await derive(input.password, salt),
      passwordSalt: toBase64(salt),
      createdAt: nowIso(),
    }

    writeUsers([...users, user])
    startSession(user.id)
    return user
  },

  async login(input: LoginInput): Promise<User> {
    const email = normalizeEmail(input.email)
    const user = readUsers().find((u) => u.email === email)

    // Same message either way — never reveal whether an account exists.
    const rejected = new DomainError('BAD_CREDENTIALS', 'Email or password is incorrect.')
    if (!user) throw rejected

    const hash = await derive(input.password, fromBase64(user.passwordSalt))
    if (hash !== user.passwordHash) throw rejected

    startSession(user.id)
    return user
  },

  async logout(): Promise<void> {
    clearSession()
  },

  async currentUser(): Promise<User | null> {
    return currentUserSync()
  },
}
