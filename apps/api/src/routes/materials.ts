import { Hono } from 'hono'
import { DomainError } from '@marble/core'
import {
  createMaterial,
  getMaterial,
  listMaterials,
  removeMaterial,
  updateMaterial,
} from '../services/materials.ts'
import { requireAuth } from '../http/session.ts'

export const materialRoutes = new Hono()
materialRoutes.use('*', requireAuth)

materialRoutes.get('/', async (c) => {
  return c.json({ materials: await listMaterials(c.get('orgId')) })
})

materialRoutes.get('/:id', async (c) => {
  const material = await getMaterial(c.get('orgId'), c.req.param('id'))
  if (!material) throw new DomainError('NOT_FOUND', 'That material no longer exists.')
  return c.json({ material })
})

materialRoutes.post('/', async (c) => {
  const material = await createMaterial(c.get('orgId'), await c.req.json())
  return c.json({ material }, 201)
})

materialRoutes.patch('/:id', async (c) => {
  const material = await updateMaterial(c.get('orgId'), c.req.param('id'), await c.req.json())
  return c.json({ material })
})

materialRoutes.delete('/:id', async (c) => {
  await removeMaterial(c.get('orgId'), c.req.param('id'))
  return c.body(null, 204)
})
