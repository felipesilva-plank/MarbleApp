import type { Piece, PieceKind } from './types'

/** Test-only factory. Not exported from the package index. */
export function makePiece(overrides: Partial<Piece> & { id: string }): Piece {
  const kind: PieceKind = overrides.kind ?? 'remnant'
  return {
    orgId: 'org_test',
    code: overrides.id.toUpperCase(),
    parentId: null,
    rootId: overrides.id,
    depth: 0,
    kind,
    status: 'available',
    materialId: null,
    lengthMm: 1000,
    widthMm: 1000,
    thicknessMm: 20,
    location: '',
    hasPhoto: false,
    notes: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'user_test',
    ...overrides,
  }
}

/**
 * Shared fixture:
 *
 *   blk (0)
 *   ├── slb1 (1)
 *   │   ├── rmn1 (2)
 *   │   └── rmn2 (2)
 *   └── slb2 (1)
 *   orphan (0)
 */
export function fixtureTree(): Piece[] {
  return [
    makePiece({ id: 'blk', kind: 'block', rootId: 'blk', depth: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
    makePiece({ id: 'slb1', kind: 'slab', parentId: 'blk', rootId: 'blk', depth: 1, createdAt: '2026-01-02T00:00:00.000Z' }),
    makePiece({ id: 'slb2', kind: 'slab', parentId: 'blk', rootId: 'blk', depth: 1, createdAt: '2026-01-03T00:00:00.000Z' }),
    makePiece({ id: 'rmn1', kind: 'remnant', parentId: 'slb1', rootId: 'blk', depth: 2, createdAt: '2026-01-04T00:00:00.000Z' }),
    makePiece({ id: 'rmn2', kind: 'remnant', parentId: 'slb1', rootId: 'blk', depth: 2, createdAt: '2026-01-05T00:00:00.000Z' }),
    makePiece({ id: 'orphan', kind: 'remnant', rootId: 'orphan', depth: 0, createdAt: '2026-01-06T00:00:00.000Z' }),
  ]
}
