import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto'
import { DomainError, loginSchema, registerSchema } from '@marble/core'
import type { LoginInput, RegisterInput, User } from '@marble/core'
import { db, isUniqueViolation } from '../db.ts'
import { env } from '../env.ts'
import { toUser } from '../mappers.ts'

/**
 * scrypt rather than PBKDF2, which is what the browser-only MVP used.
 *
 * PBKDF2 was chosen there because it is the only KDF WebCrypto offers. On the server that
 * constraint is gone, and scrypt's memory hardness is what actually costs an attacker with a GPU
 * something. N=2^15 is roughly 32 MB and ~100 ms per hash on commodity hardware — slow enough to
 * matter, fast enough that a login does not feel broken.
 */
const SCRYPT_COST = 2 ** 15
const SCRYPT_KEYLEN = 64

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    // maxmem has to be raised explicitly: node's default ceiling is below what N=2^15 needs.
    const options = { N: SCRYPT_COST, r: 8, p: 1, maxmem: 256 * SCRYPT_COST * 8 }
    scrypt(password, salt, SCRYPT_KEYLEN, options, (error, key) =>
      error ? reject(error) : resolve(key),
    )
  })
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** The raw token goes to the browser; only this hash is ever written down. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export interface IssuedSession {
  token: string
  expiresAt: Date
}

async function startSession(userId: string): Promise<IssuedSession> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + env().SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db().session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } })
  return { token, expiresAt }
}

/**
 * Registering creates the shop as well as the account, and makes the registrant its owner.
 * There is no separate "create an organisation" step because there is no state in which a user
 * exists without one — every row in the system is scoped by org.
 */
export async function register(
  input: RegisterInput,
): Promise<{ user: User; session: IssuedSession }> {
  const parsed = registerSchema.parse(input)
  const email = normalizeEmail(parsed.email)
  const salt = randomBytes(16)
  const passwordHash = (await derive(parsed.password, salt)).toString('base64')

  try {
    const user = await db().user.create({
      data: {
        email,
        name: parsed.name.trim(),
        role: 'owner',
        passwordHash,
        passwordSalt: salt.toString('base64'),
        org: {
          create: {
            name: parsed.orgName.trim(),
            // Seed both counters up front so `nextCode` is a plain UPDATE with no upsert race.
            counters: { create: [{ kind: 'slab' }, { kind: 'remnant' }] },
          },
        },
      },
    })
    return { user: toUser(user), session: await startSession(user.id) }
  } catch (error) {
    if (isUniqueViolation(error, 'email')) {
      throw new DomainError('EMAIL_TAKEN', 'An account with that email already exists.')
    }
    throw error
  }
}

export async function login(input: LoginInput): Promise<{ user: User; session: IssuedSession }> {
  const parsed = loginSchema.parse(input)
  const user = await db().user.findUnique({ where: { email: normalizeEmail(parsed.email) } })

  // Same message either way — never reveal whether an account exists.
  const rejected = new DomainError('BAD_CREDENTIALS', 'Email or password is incorrect.')
  if (!user) {
    // Still derive once against a throwaway salt. Skipping it would make "no such account"
    // measurably faster than "wrong password" and turn login into an account-enumeration oracle.
    await derive(parsed.password, randomBytes(16))
    throw rejected
  }

  const expected = Buffer.from(user.passwordHash, 'base64')
  const actual = await derive(parsed.password, Buffer.from(user.passwordSalt, 'base64'))
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw rejected

  return { user: toUser(user), session: await startSession(user.id) }
}

export async function logout(token: string | null): Promise<void> {
  if (!token) return
  // deleteMany, not delete: logging out twice is not an error worth surfacing.
  await db().session.deleteMany({ where: { tokenHash: hashToken(token) } })
}

export interface Caller {
  user: User
  orgId: string
}

/** Resolve a cookie token to the caller, or null. Expired rows are cleaned up as they are met. */
export async function callerFor(token: string | null): Promise<Caller | null> {
  if (!token) return null
  const session = await db().session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  })
  if (!session) return null

  if (session.expiresAt.getTime() <= Date.now()) {
    await db().session.delete({ where: { tokenHash: session.tokenHash } }).catch(() => {})
    return null
  }

  const user = toUser(session.user)
  return { user, orgId: user.orgId }
}
