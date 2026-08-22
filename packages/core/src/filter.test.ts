import { describe, expect, it } from 'vitest'
import { applyFilter, isUnlinked, matchesFilter } from './filter.ts'
import { fixtureTree, makePiece } from './test-utils.ts'

describe('isUnlinked', () => {
  it('flags a remnant with no recorded source', () => {
    expect(isUnlinked({ parentId: null, kind: 'remnant' })).toBe(true)
  })

  it('does not flag a slab — it was bought from a supplier, not cut from another piece', () => {
    expect(isUnlinked({ parentId: null, kind: 'slab' })).toBe(false)
  })

  it('does not flag a remnant that already has a source', () => {
    expect(isUnlinked({ parentId: 'cutA', kind: 'remnant' })).toBe(false)
  })
})

describe('matchesFilter', () => {
  const piece = makePiece({
    id: 'a',
    kind: 'remnant',
    status: 'available',
    lengthMm: 1200,
    widthMm: 600,
    thicknessMm: 20,
    location: 'Yard A / Rack 3',
    notes: 'Good for a vanity top',
    code: 'RMN-0001',
  })

  it('matches an empty filter', () => {
    expect(matchesFilter(piece, {})).toBe(true)
  })

  it('searches code, location and notes', () => {
    expect(matchesFilter(piece, { q: 'rmn-0001' })).toBe(true)
    expect(matchesFilter(piece, { q: 'rack 3' })).toBe(true)
    expect(matchesFilter(piece, { q: 'vanity' })).toBe(true)
    expect(matchesFilter(piece, { q: 'granite' })).toBe(false)
  })

  it('ignores a whitespace-only search', () => {
    expect(matchesFilter(piece, { q: '   ' })).toBe(true)
  })

  it('filters by kind and status', () => {
    expect(matchesFilter(piece, { kind: 'remnant' })).toBe(true)
    expect(matchesFilter(piece, { kind: 'slab' })).toBe(false)
    expect(matchesFilter(piece, { status: 'consumed' })).toBe(false)
  })

  it('filters by how the remnant came about', () => {
    expect(matchesFilter(piece, { remnantOrigin: 'offcut' })).toBe(true)
    expect(matchesFilter(piece, { remnantOrigin: 'rejected' })).toBe(false)
  })

  it('accepts a piece that only fits when rotated', () => {
    // Needs 600 x 1200; the piece is 1200 x 600. Stone can be turned, so this must match.
    expect(matchesFilter(piece, { minLengthMm: 600, minWidthMm: 1200 })).toBe(true)
  })

  it('rejects a piece that is too small either way round', () => {
    expect(matchesFilter(piece, { minLengthMm: 2000, minWidthMm: 100 })).toBe(false)
  })

  it('matches thickness exactly', () => {
    expect(matchesFilter(piece, { thicknessMm: 20 })).toBe(true)
    expect(matchesFilter(piece, { thicknessMm: 30 })).toBe(false)
  })
})

describe('applyFilter', () => {
  it('returns only unlinked pieces when asked', () => {
    const pieces = [
      ...fixtureTree(),
      makePiece({ id: 'lost', kind: 'remnant', parentId: null }),
    ]
    const result = applyFilter(pieces, { orphansOnly: true })
    // 'orphan' and 'lost' are parentless remnants; the slab is not counted.
    expect(result.map((p) => p.id).sort()).toEqual(['lost', 'orphan'])
  })

  it('narrows to one lineage by rootId', () => {
    expect(applyFilter(fixtureTree(), { rootId: 'slab' })).toHaveLength(5)
  })
})
