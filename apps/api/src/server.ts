import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { disconnect } from './db.ts'
import { env } from './env.ts'

/**
 * The standalone backend. `node dist/server.js` and it is running — no platform assumptions, so
 * it deploys to a container host, a VM, or anything that can run Node.
 */
const config = env()
const server = serve({ fetch: createApp().fetch, port: config.PORT }, ({ port }) => {
  console.log(`[api] listening on http://localhost:${port} (${config.NODE_ENV})`) // pre-deploy:allow-console
})

/**
 * Close the listener before dropping the connection pool, so a request that is already in flight
 * gets to finish instead of failing at the database mid-transaction.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`[api] ${signal} received, shutting down`) // pre-deploy:allow-console
  server.close(() => {
    void disconnect().then(() => process.exit(0))
  })
  // A stuck connection must not hold the process open forever.
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
