import { Hono } from 'hono'
import { callerFor, login, logout, register } from '../services/auth.ts'
import { attachSession, clearSessionCookie, requireAuth, sessionToken } from '../http/session.ts'
import { db } from '../db.ts'

export const authRoutes = new Hono()

authRoutes.post('/register', async (c) => {
  const { user, session } = await register(await c.req.json())
  attachSession(c, session)
  return c.json({ user }, 201)
})

authRoutes.post('/login', async (c) => {
  const { user, session } = await login(await c.req.json())
  attachSession(c, session)
  return c.json({ user })
})

authRoutes.post('/logout', async (c) => {
  await logout(sessionToken(c))
  clearSessionCookie(c)
  return c.body(null, 204)
})

/**
 * Answers 200-with-null rather than 401 for a signed-out visitor. This is the app's boot call:
 * "nobody is signed in" is a normal outcome of asking, not a failure, and treating it as an error
 * would put a red banner on the login screen every time someone arrives.
 */
authRoutes.get('/me', async (c) => {
  const caller = await callerFor(sessionToken(c))
  return c.json({ user: caller?.user ?? null })
})

authRoutes.get('/me/org', requireAuth, async (c) => {
  const org = await db().org.findUnique({ where: { id: c.get('orgId') } })
  return c.json({
    org: org && { id: org.id, name: org.name, createdAt: org.createdAt.toISOString() },
  })
})
