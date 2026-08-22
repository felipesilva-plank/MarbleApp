import { describe, expect, it } from 'vitest'
import { migrateLegacyBackup, parseBackup } from './migrate'

/** A v1 export: the block → slab → remnant chain the first MVP produced. */
function legacyPiece(overrides: Record<string, unknown>) {
  return {
    id: 'p1',
    orgId: 'org_local',
    code: 'RMN-0001',
    parentId: null,
    rootId: 'p1',
    depth: 0,
    kind: 'remnant',
    status: 'available',
    materialId: null,
    lengthMm: 900,
    widthMm: 600,
    thicknessMm: 20,
    location: 'Yard A',
    hasPhoto: false,
    notes: '',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    createdBy: 'system',
    ...overrides,
  }
}

function legacyBackup(pieces: Record<string, unknown>[]) {
  return {
    version: 1,
    exportedAt: '2026-07-30T00:00:00.000Z',
    pieces,
    materials: [],
    counters: { block: 1, slab: 3, remnant: 7, finished: 2 },
  }
}

describe('migrateLegacyBackup', () => {
  it('turns a block into a slab so the pieces under it keep their source', () => {
    const migrated = migrateLegacyBackup(
      legacyBackup([
        legacyPiece({ id: 'b1', code: 'BLK-0001', kind: 'block' }),
        legacyPiece({ id: 's1', code: 'SLB-0001', kind: 'slab', parentId: 'b1', rootId: 'b1', depth: 1 }),
      ]),
    )
    expect(migrated?.pieces[0]).toMatchObject({ id: 'b1', kind: 'slab', remnantOrigin: null })
    expect(migrated?.pieces[1]).toMatchObject({ id: 's1', parentId: 'b1', depth: 1 })
  })

  it('turns a finished piece into a returned remnant', () => {
    const migrated = migrateLegacyBackup(
      legacyBackup([legacyPiece({ id: 'f1', code: 'FIN-0001', kind: 'finished' })]),
    )
    expect(migrated?.pieces[0]).toMatchObject({ kind: 'remnant', remnantOrigin: 'rejected' })
  })

  it('marks an existing remnant as an offcut', () => {
    const migrated = migrateLegacyBackup(legacyBackup([legacyPiece({})]))
    expect(migrated?.pieces[0]).toMatchObject({ kind: 'remnant', remnantOrigin: 'offcut' })
  })

  it('keeps the code printed on the label in the yard', () => {
    const migrated = migrateLegacyBackup(
      legacyBackup([legacyPiece({ id: 'b1', code: 'BLK-0001', kind: 'block' })]),
    )
    expect(migrated?.pieces[0].code).toBe('BLK-0001')
  })

  it('rebuilds counters, since two of the v1 keys no longer exist', () => {
    const migrated = migrateLegacyBackup(
      legacyBackup([
        legacyPiece({ id: 's1', code: 'SLB-0009', kind: 'slab' }),
        legacyPiece({ id: 'r1', code: 'RMN-0004', kind: 'remnant' }),
        // The BLK code stays on the piece but no longer feeds the SLB series.
        legacyPiece({ id: 'b1', code: 'BLK-0001', kind: 'block' }),
      ]),
    )
    expect(migrated?.counters).toEqual({ slab: 9, remnant: 4 })
    expect(migrated?.version).toBe(2)
  })

  it('returns null for something that is not a v1 backup', () => {
    expect(migrateLegacyBackup({ version: 9, pieces: [] })).toBeNull()
    expect(migrateLegacyBackup('nonsense')).toBeNull()
  })
})

describe('parseBackup', () => {
  it('passes a current export straight through', () => {
    const current = {
      version: 2 as const,
      exportedAt: '2026-08-01T00:00:00.000Z',
      pieces: [],
      materials: [],
      counters: { slab: 0, remnant: 0 },
    }
    expect(parseBackup(current)).toEqual(current)
  })

  it('upgrades a v1 export', () => {
    expect(parseBackup(legacyBackup([legacyPiece({})]))?.version).toBe(2)
  })

  it('returns null when it is neither', () => {
    expect(parseBackup({ nope: true })).toBeNull()
  })
})
