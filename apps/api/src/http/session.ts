import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import type { Context, MiddlewareHandler } from 'hono'
import { DomainError } from '@marble/core'
import type { User } from '@marble/core'
import { callerFor } from '../services/auth.ts'
import type { IssuedSession } from '../services/auth.ts'
import { env } from '../env.ts'

export const SESSION_COOKIE = 'marble_session'

/**
 * The session token rides in an httpOnly cookie, not in a header the app reads from JS.
 *
 * A token in localStorage is readable by any script that gets onto the page; a cookie the
 * document cannot see is not. The cost is that the API and the web app are on different origins,
 * so the cookie has to be `SameSite=None; Secure` in production and every request has to opt in
 * with `credentials: 'include'` — which is also why `WEB_ORIGIN` must name real origins and can
 * never be `*`.
 */
export function attachSession(c: Context, session: IssuedSession): void {
  const production = env().NODE_ENV === 'production'
  setCookie(c, SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: production,
    // Lax keeps local development working over plain http, where Secure cookies are dropped.
    sameSite: production ? 'None' : 'Lax',
    path: '/',
    expires: session.expiresAt,
  })
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
}

export function sessionToken(c: Context): string | null {
  return getCookie(c, SESSION_COOKIE) ?? null
}

declare module 'hono' {
  interface ContextVariableMap {
    user: User
    orgId: string
  }
}

/**
 * Guards every route that touches org data. It also *supplies* `orgId` — services take it as an
 * argument and never read it from a request body, so a caller cannot ask for another shop's
 * inventory by putting a different id in the payload.
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const caller = await callerFor(sessionToken(c))
  if (!caller) {
    throw new DomainError('UNAUTHENTICATED', 'Your session has expired. Please sign in again.')
  }
  c.set('user', caller.user)
  c.set('orgId', caller.orgId)
  await next()
}
