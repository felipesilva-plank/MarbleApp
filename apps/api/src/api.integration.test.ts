import { describe, expect, it, beforeEach } from 'vitest'
import type { Material, Piece } from '@marble/core'
import { signUp, TestClient, useMemoryPhotoStore } from './test/client.ts'
import { db } from './db.ts'

/**
 * The walk a fabricator actually does, through the real HTTP app and a real Postgres: buy a slab,
 * cut it, register what is left, notice a remnant nobody logged, link it to its source.
 *
 * Nothing below the HTTP boundary is mocked. The rules that matter here — a code cannot be issued
 * twice, a delete cannot silently erase provenance, one shop cannot see another's stone — are
 * enforced by constraints and transactions, and a fake would assert none of them.
 */

type PieceBody = { piece: Piece }
type PiecesBody = { pieces: Piece[] }

const slabInput = (overrides: Partial<Piece> = {}) => ({
  kind: 'slab',
  remnantOrigin: null,
  status: 'available',
  parentId: null,
  materialId: null,
  lengthMm: 3200,
  widthMm: 1900,
  thicknessMm: 20,
  location: 'Rack 3',
  notes: '',
  ...overrides,
})

const remnantInput = (parentId: string | null, overrides: Partial<Piece> = {}) => ({
  ...slabInput(),
  kind: 'remnant',
  remnantOrigin: 'offcut',
  parentId,
  lengthMm: 900,
  widthMm: 600,
  location: 'Yard A',
  ...overrides,
})

describe('auth', () => {
  it('creates the shop along with the first account and makes them its owner', async () => {
    const { user } = await signUp('Pedra Viva')
    expect(user.role).toBe('owner')

    const org = await db().org.findUnique({ where: { id: user.orgId } })
    expect(org?.name).toBe('Pedra Viva')
  })

  it('refuses a second account on the same email', async () => {
    const client = new TestClient()
    const body = {
      name: 'A',
      orgName: 'One',
      email: 'dupe@test.dev',
      password: 'stoneyard2026',
    }
    await client.ok('/api/auth/register', 'POST', body)

    const failure = await new TestClient().failure('/api/auth/register', 'POST', body)
    expect(failure.status).toBe(409)
    expect(failure.code).toBe('EMAIL_TAKEN')
  })

  it('gives the same answer for a wrong password and an unknown account', async () => {
    await signUp()
    const unknown = await new TestClient().failure('/api/auth/login', 'POST', {
      email: 'nobody@test.dev',
      password: 'stoneyard2026',
    })
    const wrong = await new TestClient().failure('/api/auth/login', 'POST', {
      email: 'owner1@test.dev',
      password: 'wrong-password',
    })
    expect(unknown.message).toBe(wrong.message)
    expect(unknown.code).toBe('BAD_CREDENTIALS')
  })

  it('answers /me with null rather than 401 when nobody is signed in', async () => {
    const response = await new TestClient().request('/api/auth/me')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: null })
  })

  it('stops the session working after logout', async () => {
    const { client } = await signUp()
    await client.ok('/api/pieces')

    await client.ok('/api/auth/logout', 'POST')
    const failure = await client.failure('/api/pieces')
    expect(failure.status).toBe(401)
  })

  it('never returns a password hash', async () => {
    const { client } = await signUp()
    const body = await client.ok<{ user: Record<string, unknown> }>('/api/auth/me')
    expect(Object.keys(body.user)).not.toContain('passwordHash')
    expect(JSON.stringify(body.user)).not.toContain('passwordSalt')
  })

  it('rejects every inventory route without a session', async () => {
    const anonymous = new TestClient()
    for (const path of ['/api/pieces', '/api/materials', '/api/presets', '/api/backup']) {
      expect((await anonymous.failure(path)).status).toBe(401)
    }
  })
})

describe('the slab to remnant walk', () => {
  it('records provenance from a slab down through two levels of cut', async () => {
    const { client } = await signUp()

    const { piece: slab } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    expect(slab.code).toBe('SLB-0001')
    expect(slab.depth).toBe(0)
    expect(slab.rootId).toBe(slab.id)

    const { piece: offcut } = await client.ok<PieceBody>(
      '/api/pieces',
      'POST',
      remnantInput(slab.id),
    )
    expect(offcut.code).toBe('RMN-0001')
    expect(offcut.depth).toBe(1)
    expect(offcut.rootId).toBe(slab.id)

    const { piece: recut } = await client.ok<PieceBody>(
      '/api/pieces',
      'POST',
      remnantInput(offcut.id, { lengthMm: 500, widthMm: 400 }),
    )
    expect(recut.depth).toBe(2)
    expect(recut.rootId).toBe(slab.id)

    // Everything from this slab is one indexed query, which is what rootId is for.
    const { pieces } = await client.ok<PiecesBody>(`/api/pieces?rootId=${slab.id}`)
    expect(pieces).toHaveLength(3)
  })

  it('counts the two kinds separately when issuing codes', async () => {
    const { client } = await signUp()
    const { piece: slab } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    await client.ok('/api/pieces', 'POST', slabInput())
    await client.ok('/api/pieces', 'POST', remnantInput(slab.id))

    const { pieces } = await client.ok<PiecesBody>('/api/pieces')
    expect(pieces.map((p) => p.code).sort()).toEqual(['RMN-0001', 'SLB-0001', 'SLB-0002'])
  })

  it('never issues the same code twice, even for simultaneous registrations', async () => {
    const { client } = await signUp()
    // A shop cuts about six slabs a day and two people entering remnants at once is ordinary.
    // The MVP's read-modify-write over localStorage could not survive this.
    const created = await Promise.all(
      Array.from({ length: 8 }, () => client.ok<PieceBody>('/api/pieces', 'POST', remnantInput(null))),
    )
    const codes = created.map((r) => r.piece.code)
    expect(new Set(codes).size).toBe(8)
  })

  it('refuses a remnant with no stated origin', async () => {
    const { client } = await signUp()
    const failure = await client.failure('/api/pieces', 'POST', {
      ...remnantInput(null),
      remnantOrigin: null,
    })
    expect(failure.status).toBe(400)
    expect(failure.code).toBe('VALIDATION')
  })

  it('refuses the retired kinds', async () => {
    const { client } = await signUp()
    expect((await client.failure('/api/pieces', 'POST', slabInput({ kind: 'block' as never }))).status).toBe(400)
  })

  it('takes a returned job back in as a rejected remnant', async () => {
    const { client } = await signUp()
    const { piece: slab } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    const { piece } = await client.ok<PieceBody>(
      '/api/pieces',
      'POST',
      remnantInput(slab.id, { remnantOrigin: 'rejected', notes: 'Sink cutout 30 mm off.' }),
    )
    expect(piece.remnantOrigin).toBe('rejected')

    const { pieces } = await client.ok<PiecesBody>('/api/pieces?remnantOrigin=rejected')
    expect(pieces.map((p) => p.id)).toEqual([piece.id])
  })

  it('clears the origin when a remnant is corrected to a slab', async () => {
    const { client } = await signUp()
    const { piece } = await client.ok<PieceBody>('/api/pieces', 'POST', remnantInput(null))

    const { piece: fixed } = await client.ok<PieceBody>(`/api/pieces/${piece.id}`, 'PATCH', {
      kind: 'slab',
    })
    expect(fixed.kind).toBe('slab')
    expect(fixed.remnantOrigin).toBeNull()
  })
})

describe('reparenting the untracked backlog', () => {
  it('adopts an orphan and recomputes the whole subtree beneath it', async () => {
    const { client } = await signUp()
    const { piece: slab } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())

    // A remnant found on the rack, plus something already cut from it.
    const { piece: orphan } = await client.ok<PieceBody>('/api/pieces', 'POST', remnantInput(null))
    const { piece: child } = await client.ok<PieceBody>(
      '/api/pieces',
      'POST',
      remnantInput(orphan.id),
    )
    expect(orphan.rootId).toBe(orphan.id)

    const { pieces } = await client.ok<PiecesBody>(`/api/pieces/${orphan.id}/parent`, 'PUT', {
      parentId: slab.id,
    })

    // Both moved, not only the one that was reparented.
    const byId = new Map(pieces.map((p) => [p.id, p]))
    expect(byId.get(orphan.id)).toMatchObject({ rootId: slab.id, depth: 1 })
    expect(byId.get(child.id)).toMatchObject({ rootId: slab.id, depth: 2 })
  })

  it('refuses a reparent that would make a piece its own ancestor', async () => {
    const { client } = await signUp()
    const { piece: slab } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    const { piece: offcut } = await client.ok<PieceBody>(
      '/api/pieces',
      'POST',
      remnantInput(slab.id),
    )

    const failure = await client.failure(`/api/pieces/${slab.id}/parent`, 'PUT', {
      parentId: offcut.id,
    })
    expect(failure.status).toBe(409)
    expect(failure.code).toBe('CYCLE')
    // The message names both pieces, because "cycle detected" tells a fabricator nothing.
    expect(failure.message).toContain(offcut.code)
    expect(failure.message).toContain(slab.code)
  })

  it('refuses to make a piece its own parent', async () => {
    const { client } = await signUp()
    const { piece } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    expect((await client.failure(`/api/pieces/${piece.id}/parent`, 'PUT', { parentId: piece.id })).code).toBe('CYCLE')
  })

  it('lists only the parentless remnants as the backlog', async () => {
    const { client } = await signUp()
    const { piece: slab } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    await client.ok('/api/pieces', 'POST', remnantInput(slab.id))
    const { piece: orphan } = await client.ok<PieceBody>('/api/pieces', 'POST', remnantInput(null))

    const { pieces } = await client.ok<PiecesBody>('/api/pieces?orphansOnly=true')
    // The slab is parentless too, but it was bought — it never lost an origin.
    expect(pieces.map((p) => p.id)).toEqual([orphan.id])
  })
})

describe('deleting', () => {
  it('refuses to delete a piece that others were cut from', async () => {
    const { client } = await signUp()
    const { piece: slab } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    await client.ok('/api/pieces', 'POST', remnantInput(slab.id))

    const failure = await client.failure(`/api/pieces/${slab.id}`, 'DELETE')
    expect(failure.status).toBe(409)
    expect(failure.code).toBe('HAS_CHILDREN')

    expect(await db().piece.count()).toBe(2)
  })

  it('detaches the children when told to, and re-roots their descendants', async () => {
    const { client } = await signUp()
    const { piece: slab } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    const { piece: offcut } = await client.ok<PieceBody>('/api/pieces', 'POST', remnantInput(slab.id))
    const { piece: recut } = await client.ok<PieceBody>('/api/pieces', 'POST', remnantInput(offcut.id))

    await client.ok(`/api/pieces/${slab.id}?orphanChildren=true`, 'DELETE')

    const { piece: detached } = await client.ok<PieceBody>(`/api/pieces/${offcut.id}`)
    expect(detached).toMatchObject({ parentId: null, rootId: offcut.id, depth: 0 })

    const { piece: grandchild } = await client.ok<PieceBody>(`/api/pieces/${recut.id}`)
    expect(grandchild).toMatchObject({ rootId: offcut.id, depth: 1 })
  })
})

describe('materials', () => {
  it('rejects a duplicate name regardless of casing', async () => {
    const { client } = await signUp()
    const body = { name: 'Carrara White', color: '', finish: '', notes: '' }
    await client.ok('/api/materials', 'POST', body)

    const failure = await client.failure('/api/materials', 'POST', { ...body, name: 'carrara white' })
    expect(failure.status).toBe(409)
    expect(failure.code).toBe('DUPLICATE')
  })

  it('keeps the stone when a material is deleted', async () => {
    const { client } = await signUp()
    const { material } = await client.ok<{ material: Material }>('/api/materials', 'POST', {
      name: 'Nero Marquina',
      color: '',
      finish: '',
      notes: '',
    })
    const { piece } = await client.ok<PieceBody>(
      '/api/pieces',
      'POST',
      slabInput({ materialId: material.id }),
    )

    await client.ok(`/api/materials/${material.id}`, 'DELETE')

    const { piece: orphaned } = await client.ok<PieceBody>(`/api/pieces/${piece.id}`)
    expect(orphaned.materialId).toBeNull()
  })
})

describe('tenant isolation', () => {
  it('hides one shop’s stone from another', async () => {
    const shopA = await signUp('Shop A')
    const shopB = await signUp('Shop B')

    const { piece } = await shopA.client.ok<PieceBody>('/api/pieces', 'POST', slabInput())

    const { pieces } = await shopB.client.ok<PiecesBody>('/api/pieces')
    expect(pieces).toHaveLength(0)

    // A 404 rather than a 403: confirming the id exists elsewhere is itself a leak.
    expect((await shopB.client.failure(`/api/pieces/${piece.id}`)).status).toBe(404)
  })

  it('will not let one shop reparent, edit or delete another’s piece', async () => {
    const shopA = await signUp('Shop A')
    const shopB = await signUp('Shop B')
    const { piece } = await shopA.client.ok<PieceBody>('/api/pieces', 'POST', slabInput())

    expect((await shopB.client.failure(`/api/pieces/${piece.id}`, 'PATCH', { location: 'x' })).status).toBe(404)
    expect((await shopB.client.failure(`/api/pieces/${piece.id}`, 'DELETE')).status).toBe(404)
    expect((await shopB.client.failure(`/api/pieces/${piece.id}/parent`, 'PUT', { parentId: null })).status).toBe(404)

    // Unchanged.
    const { piece: intact } = await shopA.client.ok<PieceBody>(`/api/pieces/${piece.id}`)
    expect(intact.location).toBe('Rack 3')
  })

  it('starts each shop’s codes from one', async () => {
    const shopA = await signUp('Shop A')
    const shopB = await signUp('Shop B')

    const a = await shopA.client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    const b = await shopB.client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    expect(a.piece.code).toBe('SLB-0001')
    expect(b.piece.code).toBe('SLB-0001')
  })
})

describe('photos', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

  beforeEach(() => {
    useMemoryPhotoStore()
  })

  async function upload(client: TestClient, id: string, type = 'image/png'): Promise<Response> {
    const form = new FormData()
    form.set('photo', new File([PNG as BlobPart], 'piece.png', { type }))
    return client.request(`/api/pieces/${id}/photo`, { method: 'PUT', body: form })
  }

  it('stores a photo and flags the record', async () => {
    const { client } = await signUp()
    const { piece } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    expect(piece.hasPhoto).toBe(false)

    expect((await upload(client, piece.id)).status).toBe(204)

    const { piece: withPhoto } = await client.ok<PieceBody>(`/api/pieces/${piece.id}`)
    expect(withPhoto.hasPhoto).toBe(true)

    const response = await client.request(`/api/pieces/${piece.id}/photo`)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG)
  })

  it('refuses a file that is not an image', async () => {
    const { client } = await signUp()
    const { piece } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    expect((await upload(client, piece.id, 'application/pdf')).status).toBe(400)
  })

  it('clears the flag when the photo is removed', async () => {
    const { client } = await signUp()
    const { piece } = await client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    await upload(client, piece.id)

    await client.ok(`/api/pieces/${piece.id}/photo`, 'DELETE')
    const { piece: cleared } = await client.ok<PieceBody>(`/api/pieces/${piece.id}`)
    expect(cleared.hasPhoto).toBe(false)
    expect((await client.request(`/api/pieces/${piece.id}/photo`)).status).toBe(404)
  })

  it('will not serve another shop’s photo', async () => {
    const shopA = await signUp('Shop A')
    const shopB = await signUp('Shop B')
    const { piece } = await shopA.client.ok<PieceBody>('/api/pieces', 'POST', slabInput())
    await upload(shopA.client, piece.id)

    expect((await shopB.client.request(`/api/pieces/${piece.id}/photo`)).status).toBe(404)
  })
})

describe('backup', () => {
  it('round-trips an inventory, photos included', async () => {
    useMemoryPhotoStore()
    const { client } = await signUp()

    const { material } = await client.ok<{ material: Material }>('/api/materials', 'POST', {
      name: 'Carrara White',
      color: 'White',
      finish: 'Polished',
      notes: '',
    })
    const { piece: slab } = await client.ok<PieceBody>(
      '/api/pieces',
      'POST',
      slabInput({ materialId: material.id }),
    )
    await client.ok('/api/pieces', 'POST', remnantInput(slab.id))

    const form = new FormData()
    form.set('photo', new File([new Uint8Array([1, 2, 3]) as BlobPart], 'p.png', { type: 'image/png' }))
    await client.request(`/api/pieces/${slab.id}/photo`, { method: 'PUT', body: form })

    const exported = await client.ok<Record<string, unknown>>('/api/backup')
    expect(exported.version).toBe(2)

    const restored = await client.ok<{ pieces: number; materials: number }>(
      '/api/backup',
      'POST',
      exported,
    )
    expect(restored).toEqual({ pieces: 2, materials: 1 })

    const { pieces } = await client.ok<PiecesBody>('/api/pieces')
    expect(pieces).toHaveLength(2)
    // Lineage survives the rewrite of every id.
    const remnant = pieces.find((p) => p.kind === 'remnant')
    const reslab = pieces.find((p) => p.kind === 'slab')
    expect(remnant?.parentId).toBe(reslab?.id)
    expect(remnant?.rootId).toBe(reslab?.id)
    expect(reslab?.hasPhoto).toBe(true)
  })

  it('imports a v1 export from the browser-only MVP', async () => {
    const { client } = await signUp()

    // What the localStorage app wrote: four kinds, no remnantOrigin.
    const legacy = {
      version: 1,
      exportedAt: '2026-07-30T00:00:00.000Z',
      materials: [],
      counters: { block: 1, slab: 1, remnant: 1, finished: 1 },
      pieces: [
        {
          id: 'b1', orgId: 'org_local', code: 'BLK-0001', parentId: null, rootId: 'b1', depth: 0,
          kind: 'block', status: 'consumed', materialId: null,
          lengthMm: 3000, widthMm: 2000, thicknessMm: 1800,
          location: 'Yard A', hasPhoto: false, notes: 'Quarry lot 88-C.',
          createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z', createdBy: 'system',
        },
        {
          id: 's1', orgId: 'org_local', code: 'SLB-0001', parentId: 'b1', rootId: 'b1', depth: 1,
          kind: 'slab', status: 'available', materialId: null,
          lengthMm: 3000, widthMm: 2000, thicknessMm: 20,
          location: 'Rack 3', hasPhoto: false, notes: '',
          createdAt: '2026-06-02T00:00:00.000Z', updatedAt: '2026-06-02T00:00:00.000Z', createdBy: 'system',
        },
        {
          id: 'f1', orgId: 'org_local', code: 'FIN-0001', parentId: 's1', rootId: 'b1', depth: 2,
          kind: 'finished', status: 'available', materialId: null,
          lengthMm: 1600, widthMm: 650, thicknessMm: 20,
          location: 'Returns', hasPhoto: false, notes: 'Came back — wrong cutout.',
          createdAt: '2026-06-03T00:00:00.000Z', updatedAt: '2026-06-03T00:00:00.000Z', createdBy: 'system',
        },
      ],
    }

    const restored = await client.ok<{ pieces: number }>('/api/backup', 'POST', legacy)
    expect(restored.pieces).toBe(3)

    const { pieces } = await client.ok<PiecesBody>('/api/pieces')
    const byCode = new Map(pieces.map((p) => [p.code, p]))

    // The block became a slab so the slab under it keeps its source.
    expect(byCode.get('BLK-0001')).toMatchObject({ kind: 'slab', remnantOrigin: null, depth: 0 })
    // The finished piece became a returned remnant, which is what it physically is.
    expect(byCode.get('FIN-0001')).toMatchObject({ kind: 'remnant', remnantOrigin: 'rejected', depth: 2 })
    // Lineage intact all the way down.
    expect(byCode.get('SLB-0001')?.parentId).toBe(byCode.get('BLK-0001')?.id)
    expect(byCode.get('FIN-0001')?.parentId).toBe(byCode.get('SLB-0001')?.id)
  })

  it('rejects a file that is not an export', async () => {
    const { client } = await signUp()
    const failure = await client.failure('/api/backup', 'POST', { hello: 'world' })
    expect(failure.status).toBe(400)
    expect(failure.code).toBe('BAD_BACKUP')
  })

  it('does not let an import reach into another shop', async () => {
    const shopA = await signUp('Shop A')
    const shopB = await signUp('Shop B')
    await shopA.client.ok('/api/pieces', 'POST', slabInput())

    const exported = await shopA.client.ok<Record<string, unknown>>('/api/backup')
    await shopB.client.ok('/api/backup', 'POST', exported)

    // Shop A still has its own copy: the import wrote into B under fresh ids.
    expect((await shopA.client.ok<PiecesBody>('/api/pieces')).pieces).toHaveLength(1)
    expect((await shopB.client.ok<PiecesBody>('/api/pieces')).pieces).toHaveLength(1)
    expect(await db().piece.count()).toBe(2)
  })
})

describe('filtering', () => {
  it('matches a remnant that only fits when rotated', async () => {
    const { client } = await signUp()
    await client.ok('/api/pieces', 'POST', remnantInput(null, { lengthMm: 1200, widthMm: 600 }))

    // Needs 600 x 1200. Stone can be turned, so this must match.
    const { pieces } = await client.ok<PiecesBody>('/api/pieces?minLengthMm=600&minWidthMm=1200')
    expect(pieces).toHaveLength(1)
    expect((await client.ok<PiecesBody>('/api/pieces?minLengthMm=2000&minWidthMm=100')).pieces).toHaveLength(0)
  })

  it('searches code, location and notes together', async () => {
    const { client } = await signUp()
    await client.ok('/api/pieces', 'POST', slabInput({ notes: 'Held for the Oliveira job' }))
    await client.ok('/api/pieces', 'POST', slabInput({ notes: '' }))

    expect((await client.ok<PiecesBody>('/api/pieces?q=oliveira')).pieces).toHaveLength(1)
    expect((await client.ok<PiecesBody>('/api/pieces?q=SLB-0002')).pieces).toHaveLength(1)
  })

  it('offers the locations already in use for autocomplete', async () => {
    const { client } = await signUp()
    await client.ok('/api/pieces', 'POST', slabInput({ location: 'Yard B' }))
    await client.ok('/api/pieces', 'POST', slabInput({ location: 'Yard B' }))
    await client.ok('/api/pieces', 'POST', slabInput({ location: '' }))

    const { locations } = await client.ok<{ locations: string[] }>('/api/pieces/locations')
    expect(locations).toEqual(['Yard B'])
  })
})
