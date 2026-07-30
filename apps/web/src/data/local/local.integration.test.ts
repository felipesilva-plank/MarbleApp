import { beforeEach, describe, expect, it } from 'vitest'
import { consumptionSummary, getAncestors, getDescendants, isUnlinked } from '@marble/core'
import type { CreatePieceInput, Piece } from '@marble/core'
import { DomainError } from '../errors'
import { localAuthPort } from './authRepo'
import { localBackupPort } from './backup'
import { localMaterialRepository } from './materialRepo'
import { localPieceRepository } from './pieceRepo'
import { clearPhotos } from './photos'

/**
 * The end-to-end walk from the plan, driven through the real adapters rather than a browser.
 * These are the code paths the UI calls, so a regression here is a regression in the app.
 */

const piecesRepo = localPieceRepository
const materialsRepo = localMaterialRepository

function pieceInput(overrides: Partial<CreatePieceInput> = {}): CreatePieceInput {
  return {
    kind: 'remnant',
    status: 'available',
    parentId: null,
    materialId: null,
    lengthMm: 1000,
    widthMm: 500,
    thicknessMm: 20,
    location: '',
    notes: '',
    ...overrides,
  }
}

beforeEach(async () => {
  localStorage.clear()
  await clearPhotos()
  await localAuthPort.register({
    name: 'Ana Souza',
    email: 'ana@yard.example',
    password: 'stone12345',
  })
})

describe('accounts', () => {
  it('signs a registered user in and back out', async () => {
    expect((await localAuthPort.currentUser())?.email).toBe('ana@yard.example')
    await localAuthPort.logout()
    expect(await localAuthPort.currentUser()).toBeNull()
  })

  it('never stores the password in plaintext', async () => {
    const raw = localStorage.getItem('marble.v1.users') ?? ''
    expect(raw).not.toContain('stone12345')
    expect(raw).toContain('passwordHash')
  })

  it('rejects a duplicate email', async () => {
    await expect(
      localAuthPort.register({ name: 'Other', email: 'ANA@yard.example', password: 'another123' }),
    ).rejects.toThrow(DomainError)
  })

  it('rejects a wrong password without revealing whether the account exists', async () => {
    const wrongPassword = localAuthPort
      .login({ email: 'ana@yard.example', password: 'nope12345' })
      .catch((e: DomainError) => e.message)
    const noSuchUser = localAuthPort
      .login({ email: 'ghost@yard.example', password: 'nope12345' })
      .catch((e: DomainError) => e.message)

    expect(await wrongPassword).toBe(await noSuchUser)
  })

  it('accepts the correct password', async () => {
    await localAuthPort.logout()
    const user = await localAuthPort.login({ email: 'ana@yard.example', password: 'stone12345' })
    expect(user.name).toBe('Ana Souza')
  })

  it('refuses to create a piece with no session', async () => {
    await localAuthPort.logout()
    await expect(piecesRepo.create(pieceInput())).rejects.toThrow(DomainError)
  })
})

describe('the block → slab → remnant walk', () => {
  let block: Piece
  let slab: Piece
  let remnantA: Piece
  let remnantB: Piece

  beforeEach(async () => {
    const material = await materialsRepo.create({
      name: 'Carrara White',
      color: 'White',
      finish: 'Polished',
      notes: '',
    })

    block = await piecesRepo.create(
      pieceInput({
        kind: 'block',
        materialId: material.id,
        lengthMm: 3000,
        widthMm: 2000,
        thicknessMm: 800,
      }),
    )
    slab = await piecesRepo.create(
      pieceInput({
        kind: 'slab',
        parentId: block.id,
        materialId: material.id,
        lengthMm: 3000,
        widthMm: 2000,
      }),
    )
    remnantA = await piecesRepo.create(
      pieceInput({ parentId: slab.id, materialId: material.id, lengthMm: 1500, widthMm: 2000 }),
    )
    remnantB = await piecesRepo.create(
      pieceInput({ parentId: slab.id, materialId: material.id, lengthMm: 750, widthMm: 2000 }),
    )
  })

  it('assigns sequential per-kind codes', () => {
    expect(block.code).toBe('BLK-0001')
    expect(slab.code).toBe('SLB-0001')
    expect(remnantA.code).toBe('RMN-0001')
    expect(remnantB.code).toBe('RMN-0002')
  })

  it('records lineage depth and root on creation', () => {
    expect(block).toMatchObject({ parentId: null, rootId: block.id, depth: 0 })
    expect(slab).toMatchObject({ parentId: block.id, rootId: block.id, depth: 1 })
    expect(remnantA).toMatchObject({ parentId: slab.id, rootId: block.id, depth: 2 })
  })

  it('answers "where did this come from?" for a remnant', async () => {
    const all = await piecesRepo.list()
    expect(getAncestors(all, remnantA.id).map((p) => p.code)).toEqual(['BLK-0001', 'SLB-0001'])
  })

  it('answers "what did this produce?" for the block', async () => {
    const all = await piecesRepo.list()
    expect(getDescendants(all, block.id)).toHaveLength(3)
  })

  it('never changes the parent status when a child is registered', async () => {
    expect((await piecesRepo.get(slab.id))?.status).toBe('available')
  })

  it('reports consumption as an advisory figure', async () => {
    const all = await piecesRepo.list()
    const children = all.filter((p) => p.parentId === slab.id)
    const summary = consumptionSummary(slab, children)

    expect(summary.parentAreaM2).toBe(6)
    expect(summary.childrenAreaM2).toBe(4.5)
    expect(summary.accountedPct).toBe(75)
  })

  it('rejects a lineage loop and writes nothing', async () => {
    await expect(piecesRepo.assignParent(block.id, remnantA.id)).rejects.toMatchObject({
      code: 'CYCLE',
    })
    expect((await piecesRepo.get(block.id))?.parentId).toBeNull()
  })

  it('rejects a piece becoming its own source', async () => {
    await expect(piecesRepo.assignParent(slab.id, slab.id)).rejects.toMatchObject({ code: 'CYCLE' })
  })

  it('adopts an orphan and recomputes its lineage', async () => {
    const orphan = await piecesRepo.create(pieceInput({ location: 'Yard B' }))
    expect(isUnlinked(orphan)).toBe(true)

    await piecesRepo.assignParent(orphan.id, slab.id)

    const adopted = await piecesRepo.get(orphan.id)
    expect(adopted).toMatchObject({ parentId: slab.id, rootId: block.id, depth: 2 })
    expect(isUnlinked(adopted as Piece)).toBe(false)
  })

  it('recomputes an entire subtree when a branch is detached', async () => {
    await piecesRepo.assignParent(slab.id, null)

    const [movedSlab, movedRemnant] = await Promise.all([
      piecesRepo.get(slab.id),
      piecesRepo.get(remnantA.id),
    ])

    expect(movedSlab).toMatchObject({ rootId: slab.id, depth: 0 })
    expect(movedRemnant).toMatchObject({ rootId: slab.id, depth: 1 })
  })

  it('blocks deleting a piece that others were cut from', async () => {
    await expect(piecesRepo.remove(slab.id)).rejects.toMatchObject({ code: 'HAS_CHILDREN' })
    expect(await piecesRepo.get(slab.id)).not.toBeNull()
  })

  it('orphans the children when that deletion is explicitly confirmed', async () => {
    await piecesRepo.remove(slab.id, { orphanChildren: true })

    expect(await piecesRepo.get(slab.id)).toBeNull()
    const survivor = await piecesRepo.get(remnantA.id)
    expect(survivor).toMatchObject({ parentId: null, depth: 0, rootId: remnantA.id })
  })

  it('filters by material, status and size', async () => {
    expect(await piecesRepo.list({ materialId: block.materialId })).toHaveLength(4)
    expect(await piecesRepo.list({ kind: 'remnant', status: 'available' })).toHaveLength(2)
    // 2000 x 1500 fits remnantA (1500 x 2000) only when rotated.
    const roomy = await piecesRepo.list({ minLengthMm: 2000, minWidthMm: 1500 })
    expect(roomy.map((p) => p.code).sort()).toEqual(['BLK-0001', 'RMN-0001', 'SLB-0001'])
  })

  it('does not let update() quietly rewrite lineage', async () => {
    await piecesRepo.update(remnantA.id, {
      parentId: block.id,
      notes: 'edited',
    } as never)

    const after = await piecesRepo.get(remnantA.id)
    expect(after?.parentId).toBe(slab.id) // unchanged — only assignParent may move a piece
    expect(after?.notes).toBe('edited')
  })

  it('collects known locations for the autocomplete', async () => {
    await piecesRepo.update(remnantA.id, { location: 'Yard A / Rack 1' })
    await piecesRepo.update(remnantB.id, { location: 'Yard A / Rack 1' })
    expect(await piecesRepo.knownLocations()).toEqual(['Yard A / Rack 1'])
  })

  it('stores and clears a photo', async () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    await piecesRepo.setPhoto(remnantA.id, dataUrl)

    expect((await piecesRepo.get(remnantA.id))?.hasPhoto).toBe(true)
    expect(await piecesRepo.getPhotoUrl(remnantA.id)).toBe(dataUrl)

    await piecesRepo.setPhoto(remnantA.id, null)
    expect((await piecesRepo.get(remnantA.id))?.hasPhoto).toBe(false)
    expect(await piecesRepo.getPhotoUrl(remnantA.id)).toBeNull()
  })

  it('deletes the photo along with the piece', async () => {
    await piecesRepo.setPhoto(remnantA.id, 'data:image/jpeg;base64,AAAA')
    await piecesRepo.remove(remnantA.id)
    expect(await piecesRepo.getPhotoUrl(remnantA.id)).toBeNull()
  })

  it('survives an export / wipe / import round trip', async () => {
    await piecesRepo.setPhoto(remnantA.id, 'data:image/jpeg;base64,ROUNDTRIP')
    const dump = await localBackupPort.exportAll()

    localStorage.removeItem('marble.v1.pieces')
    localStorage.removeItem('marble.v1.materials')
    await clearPhotos()
    expect(await piecesRepo.list()).toHaveLength(0)

    await localBackupPort.importAll(dump)

    const restored = await piecesRepo.list()
    expect(restored).toHaveLength(4)
    expect(await piecesRepo.getPhotoUrl(remnantA.id)).toBe('data:image/jpeg;base64,ROUNDTRIP')
    expect(getAncestors(restored, remnantA.id).map((p) => p.code)).toEqual([
      'BLK-0001',
      'SLB-0001',
    ])
    expect(await materialsRepo.list()).toHaveLength(1)
  })

  it('continues the code sequence after an import instead of colliding', async () => {
    const dump = await localBackupPort.exportAll()
    localStorage.setItem('marble.v1.counters', JSON.stringify({ block: 0, slab: 0, remnant: 0, finished: 0 }))
    await localBackupPort.importAll(dump)

    const next = await piecesRepo.create(pieceInput())
    expect(next.code).toBe('RMN-0003')
  })

  it('refuses a malformed backup rather than corrupting the store', async () => {
    await expect(localBackupPort.importAll('{ not json')).rejects.toMatchObject({
      code: 'BAD_BACKUP',
    })
    await expect(localBackupPort.importAll('{"version":9}')).rejects.toMatchObject({
      code: 'BAD_BACKUP',
    })
    expect(await piecesRepo.list()).toHaveLength(4)
  })

  it('clears the material reference when a material is deleted', async () => {
    await materialsRepo.remove(block.materialId as string)
    expect((await piecesRepo.get(block.id))?.materialId).toBeNull()
  })
})
