import { describe, expect, it } from 'vitest'
import {
  buildForest,
  buildTreeFrom,
  getAncestors,
  getChildren,
  getDescendants,
  invalidParentIds,
  recomputeSubtree,
  wouldCreateCycle,
} from './tree'
import { fixtureTree, makePiece } from './test-utils'

const ids = (pieces: { id: string }[]) => pieces.map((p) => p.id).sort()

describe('getAncestors', () => {
  it('returns the provenance chain ordered root-first', () => {
    expect(getAncestors(fixtureTree(), 'rmn1').map((p) => p.id)).toEqual(['blk', 'slb1'])
  })

  it('returns empty for a root piece', () => {
    expect(getAncestors(fixtureTree(), 'blk')).toEqual([])
  })

  it('returns empty for an unknown id', () => {
    expect(getAncestors(fixtureTree(), 'nope')).toEqual([])
  })

  it('treats a dangling parent reference as a root instead of throwing', () => {
    const pieces = [makePiece({ id: 'a', parentId: 'ghost' })]
    expect(getAncestors(pieces, 'a')).toEqual([])
  })

  it('terminates on cyclic data rather than spinning', () => {
    const pieces = [
      makePiece({ id: 'a', parentId: 'b' }),
      makePiece({ id: 'b', parentId: 'a' }),
    ]
    expect(getAncestors(pieces, 'a').length).toBeLessThanOrEqual(2)
  })
})

describe('getDescendants', () => {
  it('returns every piece below, all levels', () => {
    expect(ids(getDescendants(fixtureTree(), 'blk'))).toEqual(['rmn1', 'rmn2', 'slb1', 'slb2'])
  })

  it('returns only the direct level when there are no grandchildren', () => {
    expect(ids(getDescendants(fixtureTree(), 'slb1'))).toEqual(['rmn1', 'rmn2'])
  })

  it('returns empty for a leaf', () => {
    expect(getDescendants(fixtureTree(), 'rmn1')).toEqual([])
  })

  it('terminates on cyclic data', () => {
    const pieces = [
      makePiece({ id: 'a', parentId: 'b' }),
      makePiece({ id: 'b', parentId: 'a' }),
    ]
    expect(getDescendants(pieces, 'a').length).toBeLessThanOrEqual(2)
  })
})

describe('getChildren', () => {
  it('returns direct children only, oldest first', () => {
    expect(getChildren(fixtureTree(), 'blk').map((p) => p.id)).toEqual(['slb1', 'slb2'])
  })
})

describe('wouldCreateCycle', () => {
  const pieces = fixtureTree()

  it('rejects a piece becoming its own parent', () => {
    expect(wouldCreateCycle(pieces, 'blk', 'blk')).toBe(true)
  })

  it('rejects a direct child as parent', () => {
    expect(wouldCreateCycle(pieces, 'blk', 'slb1')).toBe(true)
  })

  it('rejects a deep descendant as parent', () => {
    expect(wouldCreateCycle(pieces, 'blk', 'rmn1')).toBe(true)
  })

  it('allows detaching to root', () => {
    expect(wouldCreateCycle(pieces, 'slb1', null)).toBe(false)
  })

  it('allows an unrelated piece as parent', () => {
    expect(wouldCreateCycle(pieces, 'orphan', 'slb1')).toBe(false)
  })

  it('allows moving a subtree sideways under a sibling', () => {
    expect(wouldCreateCycle(pieces, 'slb1', 'slb2')).toBe(false)
  })
})

describe('recomputeSubtree', () => {
  it('sets depth and rootId when an orphan is adopted', () => {
    const pieces = fixtureTree().map((p) =>
      p.id === 'orphan' ? { ...p, parentId: 'slb1' } : p,
    )
    const updated = recomputeSubtree(pieces, 'orphan')

    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ id: 'orphan', rootId: 'blk', depth: 2 })
  })

  it('propagates through an entire moved subtree', () => {
    // Detach slb1 (which carries rmn1 + rmn2) so it becomes its own root.
    const pieces = fixtureTree().map((p) => (p.id === 'slb1' ? { ...p, parentId: null } : p))
    const updated = recomputeSubtree(pieces, 'slb1')
    const byId = new Map(updated.map((p) => [p.id, p]))

    expect(ids(updated)).toEqual(['rmn1', 'rmn2', 'slb1'])
    expect(byId.get('slb1')).toMatchObject({ rootId: 'slb1', depth: 0 })
    expect(byId.get('rmn1')).toMatchObject({ rootId: 'slb1', depth: 1 })
    expect(byId.get('rmn2')).toMatchObject({ rootId: 'slb1', depth: 1 })
  })

  it('deepens a subtree when it is nested further down', () => {
    const pieces = fixtureTree().map((p) => (p.id === 'slb1' ? { ...p, parentId: 'rmn2' } : p))
    // Contrived on purpose: guards that depth math follows the parent, not the old value.
    const updated = recomputeSubtree(pieces, 'slb1')
    const byId = new Map(updated.map((p) => [p.id, p]))

    expect(byId.get('slb1')).toMatchObject({ depth: 3, rootId: 'blk' })
    expect(byId.get('rmn1')).toMatchObject({ depth: 4, rootId: 'blk' })
  })

  it('does not mutate the input pieces', () => {
    const pieces = fixtureTree().map((p) => (p.id === 'orphan' ? { ...p, parentId: 'slb1' } : p))
    const before = JSON.stringify(pieces)
    recomputeSubtree(pieces, 'orphan')
    expect(JSON.stringify(pieces)).toBe(before)
  })

  it('returns empty for an unknown id', () => {
    expect(recomputeSubtree(fixtureTree(), 'nope')).toEqual([])
  })
})

describe('buildForest', () => {
  it('nests children under their roots', () => {
    const forest = buildForest(fixtureTree())
    expect(forest.map((n) => n.piece.id)).toEqual(['blk', 'orphan'])

    const blk = forest[0]
    expect(blk.children.map((n) => n.piece.id)).toEqual(['slb1', 'slb2'])
    expect(blk.children[0].children.map((n) => n.piece.id)).toEqual(['rmn1', 'rmn2'])
  })

  it('promotes a piece whose parent is outside the set to a root', () => {
    const subset = fixtureTree().filter((p) => p.id !== 'blk')
    const forest = buildForest(subset)
    expect(forest.map((n) => n.piece.id).sort()).toEqual(['orphan', 'slb1', 'slb2'])
  })
})

describe('buildTreeFrom', () => {
  it('roots the tree at the requested piece', () => {
    const tree = buildTreeFrom(fixtureTree(), 'slb1')
    expect(tree?.piece.id).toBe('slb1')
    expect(tree?.children.map((n) => n.piece.id)).toEqual(['rmn1', 'rmn2'])
  })

  it('returns null for an unknown id', () => {
    expect(buildTreeFrom(fixtureTree(), 'nope')).toBeNull()
  })
})

describe('invalidParentIds', () => {
  it('excludes the piece itself and all of its descendants', () => {
    expect([...invalidParentIds(fixtureTree(), 'blk')].sort()).toEqual([
      'blk',
      'rmn1',
      'rmn2',
      'slb1',
      'slb2',
    ])
  })
})
