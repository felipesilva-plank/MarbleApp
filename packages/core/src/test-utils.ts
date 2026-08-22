import type { Piece, PieceKind } from './types.ts'

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
    remnantOrigin: kind === 'remnant' ? 'offcut' : null,
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
 * Shared fixture — a slab cut twice, one of whose offcuts was itself re-cut:
 *
 *   slab (0)
 *   ├── cutA (1)
 *   │   ├── cutA1 (2)
 *   │   └── cutA2 (2)
 *   └── cutB (1)
 *   orphan (0)   remnant whose source was never recorded
 */
export function fixtureTree(): Piece[] {
  return [
    makePiece({ id: 'slab', kind: 'slab', rootId: 'slab', depth: 0, createdAt: '2026-01-01T00:00:00.000Z' }),
    makePiece({ id: 'cutA', parentId: 'slab', rootId: 'slab', depth: 1, createdAt: '2026-01-02T00:00:00.000Z' }),
    makePiece({ id: 'cutB', parentId: 'slab', rootId: 'slab', depth: 1, createdAt: '2026-01-03T00:00:00.000Z' }),
    makePiece({ id: 'cutA1', parentId: 'cutA', rootId: 'slab', depth: 2, createdAt: '2026-01-04T00:00:00.000Z' }),
    makePiece({ id: 'cutA2', parentId: 'cutA', rootId: 'slab', depth: 2, createdAt: '2026-01-05T00:00:00.000Z' }),
    makePiece({ id: 'orphan', rootId: 'orphan', depth: 0, createdAt: '2026-01-06T00:00:00.000Z' }),
  ]
}
