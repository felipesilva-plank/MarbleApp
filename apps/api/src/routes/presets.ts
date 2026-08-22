import { Hono } from 'hono'
import { createPreset, listPresets, removePreset } from '../services/presets.ts'
import { requireAuth } from '../http/session.ts'

export const presetRoutes = new Hono()
presetRoutes.use('*', requireAuth)

presetRoutes.get('/', async (c) => {
  return c.json({ presets: await listPresets(c.get('orgId')) })
})

presetRoutes.post('/', async (c) => {
  const preset = await createPreset(c.get('orgId'), await c.req.json())
  return c.json({ preset }, 201)
})

presetRoutes.delete('/:id', async (c) => {
  await removePreset(c.get('orgId'), c.req.param('id'))
  return c.body(null, 204)
})
