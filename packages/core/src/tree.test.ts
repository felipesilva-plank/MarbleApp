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
} from './tree.ts'
import { fixtureTree, makePiece } from './test-utils.ts'

const ids = (pieces: { id: string }[]) => pieces.map((p) => p.id).sort()

describe('getAncestors', () => {
  it('returns the provenance chain ordered root-first', () => {
    expect(getAncestors(fixtureTree(), 'cutA1').map((p) => p.id)).toEqual(['slab', 'cutA'])
  })

  it('returns empty for a root piece', () => {
    expect(getAncestors(fixtureTree(), 'slab')).toEqual([])
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
    expect(ids(getDescendants(fixtureTree(), 'slab'))).toEqual(['cutA', 'cutA1', 'cutA2', 'cutB'])
  })

  it('returns only the direct level when there are no grandchildren', () => {
    expect(ids(getDescendants(fixtureTree(), 'cutA'))).toEqual(['cutA1', 'cutA2'])
  })

  it('returns empty for a leaf', () => {
    expect(getDescendants(fixtureTree(), 'cutA1')).toEqual([])
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
    expect(getChildren(fixtureTree(), 'slab').map((p) => p.id)).toEqual(['cutA', 'cutB'])
  })
})

describe('wouldCreateCycle', () => {
  const pieces = fixtureTree()

  it('rejects a piece becoming its own parent', () => {
    expect(wouldCreateCycle(pieces, 'slab', 'slab')).toBe(true)
  })

  it('rejects a direct child as parent', () => {
    expect(wouldCreateCycle(pieces, 'slab', 'cutA')).toBe(true)
  })

  it('rejects a deep descendant as parent', () => {
    expect(wouldCreateCycle(pieces, 'slab', 'cutA1')).toBe(true)
  })

  it('allows detaching to root', () => {
    expect(wouldCreateCycle(pieces, 'cutA', null)).toBe(false)
  })

  it('allows an unrelated piece as parent', () => {
    expect(wouldCreateCycle(pieces, 'orphan', 'cutA')).toBe(false)
  })

  it('allows moving a subtree sideways under a sibling', () => {
    expect(wouldCreateCycle(pieces, 'cutA', 'cutB')).toBe(false)
  })
})

describe('recomputeSubtree', () => {
  it('sets depth and rootId when an orphan is adopted', () => {
    const pieces = fixtureTree().map((p) =>
      p.id === 'orphan' ? { ...p, parentId: 'cutA' } : p,
    )
    const updated = recomputeSubtree(pieces, 'orphan')

    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ id: 'orphan', rootId: 'slab', depth: 2 })
  })

  it('propagates through an entire moved subtree', () => {
    // Detach cutA (which carries cutA1 + cutA2) so it becomes its own root.
    const pieces = fixtureTree().map((p) => (p.id === 'cutA' ? { ...p, parentId: null } : p))
    const updated = recomputeSubtree(pieces, 'cutA')
    const byId = new Map(updated.map((p) => [p.id, p]))

    expect(ids(updated)).toEqual(['cutA', 'cutA1', 'cutA2'])
    expect(byId.get('cutA')).toMatchObject({ rootId: 'cutA', depth: 0 })
    expect(byId.get('cutA1')).toMatchObject({ rootId: 'cutA', depth: 1 })
    expect(byId.get('cutA2')).toMatchObject({ rootId: 'cutA', depth: 1 })
  })

  it('deepens a subtree when it is nested further down', () => {
    const pieces = fixtureTree().map((p) => (p.id === 'cutA' ? { ...p, parentId: 'cutA2' } : p))
    // Contrived on purpose: guards that depth math follows the parent, not the old value.
    const updated = recomputeSubtree(pieces, 'cutA')
    const byId = new Map(updated.map((p) => [p.id, p]))

    expect(byId.get('cutA')).toMatchObject({ depth: 3, rootId: 'slab' })
    expect(byId.get('cutA1')).toMatchObject({ depth: 4, rootId: 'slab' })
  })

  it('does not mutate the input pieces', () => {
    const pieces = fixtureTree().map((p) => (p.id === 'orphan' ? { ...p, parentId: 'cutA' } : p))
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
    expect(forest.map((n) => n.piece.id)).toEqual(['slab', 'orphan'])

    const slab = forest[0]
    expect(slab.children.map((n) => n.piece.id)).toEqual(['cutA', 'cutB'])
    expect(slab.children[0].children.map((n) => n.piece.id)).toEqual(['cutA1', 'cutA2'])
  })

  it('promotes a piece whose parent is outside the set to a root', () => {
    const subset = fixtureTree().filter((p) => p.id !== 'slab')
    const forest = buildForest(subset)
    expect(forest.map((n) => n.piece.id).sort()).toEqual(['cutA', 'cutB', 'orphan'])
  })
})

describe('buildTreeFrom', () => {
  it('roots the tree at the requested piece', () => {
    const tree = buildTreeFrom(fixtureTree(), 'cutA')
    expect(tree?.piece.id).toBe('cutA')
    expect(tree?.children.map((n) => n.piece.id)).toEqual(['cutA1', 'cutA2'])
  })

  it('returns null for an unknown id', () => {
    expect(buildTreeFrom(fixtureTree(), 'nope')).toBeNull()
  })
})

describe('invalidParentIds', () => {
  it('excludes the piece itself and all of its descendants', () => {
    expect([...invalidParentIds(fixtureTree(), 'slab')].sort()).toEqual([
      'cutA',
      'cutA1',
      'cutA2',
      'cutB',
      'slab',
    ])
  })
})
