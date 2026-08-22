import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { allowedOrigins, env } from './env.ts'
import { toResponse } from './http/errors.ts'
import { authRoutes } from './routes/auth.ts'
import { backupRoutes } from './routes/backup.ts'
import { materialRoutes } from './routes/materials.ts'
import { pieceRoutes } from './routes/pieces.ts'
import { presetRoutes } from './routes/presets.ts'
import { db } from './db.ts'

/**
 * The application, separate from the thing that listens on a port.
 *
 * `server.ts` wraps this in a Node HTTP server, and the tests call `app.request()` directly with
 * no socket involved. Keeping the two apart is also what makes the API host-agnostic: it is a
 * plain fetch handler, so a container, a VM, or a serverless adapter are all the same to it.
 */
export function createApp(): Hono {
  const app = new Hono()

  app.use(
    '*',
    cors({
      // A concrete list, never '*'. Browsers reject a wildcard on a credentialed request, and a
      // reflected origin would let any site drive this API with the user's session cookie.
      origin: (origin) => (allowedOrigins().includes(origin) ? origin : null),
      credentials: true,
      allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 86_400,
    }),
  )

  /** Liveness plus a real database round trip — a process that cannot reach Postgres is not up. */
  app.get('/health', async (c) => {
    try {
      await db().$queryRaw`SELECT 1`
      return c.json({ ok: true, env: env().NODE_ENV })
    } catch {
      return c.json({ ok: false, error: 'database unreachable' }, 503)
    }
  })

  app.route('/api/auth', authRoutes)
  app.route('/api/pieces', pieceRoutes)
  app.route('/api/materials', materialRoutes)
  app.route('/api/presets', presetRoutes)
  app.route('/api/backup', backupRoutes)

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } }, 404))
  app.onError((error, c) => toResponse(error, c))

  return app
}
