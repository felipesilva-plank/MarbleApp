import { Hono } from 'hono'
import { DomainError } from '@marble/core'
import type { PieceFilter, PieceKind, PieceStatus, RemnantOrigin } from '@marble/core'
import {
  assignParent,
  createPiece,
  getPhoto,
  getPiece,
  knownLocations,
  listPieces,
  removePiece,
  setPhoto,
  updatePiece,
} from '../services/pieces.ts'
import { assertUploadable, MAX_PHOTO_BYTES } from '../photos/store.ts'
import { requireAuth } from '../http/session.ts'

export const pieceRoutes = new Hono()
pieceRoutes.use('*', requireAuth)

/** Query string in, `PieceFilter` out. Empty strings become undefined so `?kind=` means "any". */
function filterFromQuery(query: Record<string, string>): PieceFilter {
  const text = (key: string) => (query[key]?.trim() ? query[key].trim() : undefined)
  const int = (key: string) => {
    const raw = text(key)
    if (raw === undefined) return undefined
    const value = Number.parseInt(raw, 10)
    return Number.isFinite(value) ? value : undefined
  }

  return {
    q: text('q'),
    kind: text('kind') as PieceKind | undefined,
    remnantOrigin: text('remnantOrigin') as RemnantOrigin | undefined,
    status: text('status') as PieceStatus | undefined,
    materialId: text('materialId'),
    location: text('location'),
    rootId: text('rootId'),
    parentId: text('parentId'),
    minLengthMm: int('minLengthMm'),
    minWidthMm: int('minWidthMm'),
    thicknessMm: int('thicknessMm'),
    orphansOnly: query.orphansOnly === 'true' || query.orphansOnly === '1',
  }
}

pieceRoutes.get('/', async (c) => {
  const pieces = await listPieces(c.get('orgId'), filterFromQuery(c.req.query()))
  return c.json({ pieces })
})

pieceRoutes.get('/locations', async (c) => {
  return c.json({ locations: await knownLocations(c.get('orgId')) })
})

pieceRoutes.get('/:id', async (c) => {
  const piece = await getPiece(c.get('orgId'), c.req.param('id'))
  if (!piece) throw new DomainError('NOT_FOUND', 'That piece no longer exists.')
  return c.json({ piece })
})

pieceRoutes.post('/', async (c) => {
  const piece = await createPiece(c.get('orgId'), c.get('user').id, await c.req.json())
  return c.json({ piece }, 201)
})

pieceRoutes.patch('/:id', async (c) => {
  const piece = await updatePiece(c.get('orgId'), c.req.param('id'), await c.req.json())
  return c.json({ piece })
})

/** Returns every piece whose lineage changed, which is what the client has to invalidate. */
pieceRoutes.put('/:id/parent', async (c) => {
  const body = (await c.req.json()) as { parentId?: string | null }
  const updated = await assignParent(c.get('orgId'), c.req.param('id'), body.parentId ?? null)
  return c.json({ pieces: updated })
})

pieceRoutes.delete('/:id', async (c) => {
  const orphanChildren = c.req.query('orphanChildren') === 'true'
  await removePiece(c.get('orgId'), c.req.param('id'), { orphanChildren })
  return c.body(null, 204)
})

/**
 * Photos go over `multipart/form-data`, not as a base64 data URL in JSON. Base64 inflates bytes
 * by a third and forces the whole image through a JSON parser; a multipart body streams.
 */
pieceRoutes.put('/:id/photo', async (c) => {
  const form = await c.req.parseBody()
  const file = form.photo
  if (!(file instanceof File)) {
    throw new DomainError('VALIDATION', 'Attach an image file under the field name "photo".')
  }
  assertUploadable(file.type, file.size)

  const bytes = new Uint8Array(await file.arrayBuffer())
  // Re-checked after reading: `File.size` is client-supplied metadata until the bytes are in hand.
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    throw new DomainError('QUOTA', 'That photo is larger than 8 MB. Take it again at a lower size.')
  }

  await setPhoto(c.get('orgId'), c.req.param('id'), { bytes, contentType: file.type })
  return c.body(null, 204)
})

pieceRoutes.delete('/:id/photo', async (c) => {
  await setPhoto(c.get('orgId'), c.req.param('id'), null)
  return c.body(null, 204)
})

pieceRoutes.get('/:id/photo', async (c) => {
  const photo = await getPhoto(c.get('orgId'), c.req.param('id'))
  if (!photo) throw new DomainError('NOT_FOUND', 'That piece has no photo.')

  return c.body(photo.bytes as unknown as ArrayBuffer, 200, {
    'Content-Type': photo.contentType,
    // Private: the URL is org-scoped and behind a session, so a shared cache must not keep it.
    'Cache-Control': 'private, max-age=300',
  })
})
