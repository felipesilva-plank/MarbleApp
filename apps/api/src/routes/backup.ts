import { Hono } from 'hono'
import { exportAll, importAll } from '../services/backup.ts'
import { requireAuth } from '../http/session.ts'

export const backupRoutes = new Hono()
backupRoutes.use('*', requireAuth)

backupRoutes.get('/', async (c) => {
  return c.json(await exportAll(c.get('orgId')))
})

backupRoutes.post('/', async (c) => {
  const restored = await importAll(c.get('orgId'), c.get('user').id, await c.req.json())
  return c.json(restored)
})
