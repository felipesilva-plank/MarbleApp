import type { Session, User } from '@marble/core'
import { DomainError } from '../errors'
import { KEYS, readJson, writeJson } from './db'

export function readUsers(): User[] {
  return readJson<User[]>(KEYS.users, [])
}

export function writeUsers(users: User[]): void {
  writeJson(KEYS.users, users)
}

export function readSession(): Session | null {
  const session = readJson<Session | null>(KEYS.session, null)
  if (!session) return null
  if (Number.isNaN(Date.parse(session.expiresAt)) || Date.parse(session.expiresAt) < Date.now()) {
    clearSession()
    return null
  }
  return session
}

export function writeSession(session: Session): void {
  writeJson(KEYS.session, session)
}

export function clearSession(): void {
  localStorage.removeItem(KEYS.session)
}

export function currentUserSync(): User | null {
  const session = readSession()
  if (!session) return null
  return readUsers().find((u) => u.id === session.userId) ?? null
}

/**
 * The local stand-in for "read the user id off the JWT". Repositories call this instead of
 * accepting a createdBy parameter, so the port signatures already match the future API.
 */
export function requireUserId(): string {
  const user = currentUserSync()
  if (!user) {
    throw new DomainError('UNAUTHENTICATED', 'Your session has expired. Please sign in again.')
  }
  return user.id
}
