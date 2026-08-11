import type { Piece, PieceKind, TreeNode } from './types'

/**
 * What comes out of a given kind of stone, as a form default only.
 * A block is sawn into slabs; cutting a slab leaves remnants. Users can always override.
 */
export function suggestChildKind(parentKind: PieceKind): PieceKind {
  return parentKind === 'block' ? 'slab' : 'remnant'
}

/**
 * Lineage math. This is the heart of the app: every screen that answers "where did this come
 * from?" or "what did this produce?" runs through here.
 *
 * Every traversal is defensive against cyclic data. A cycle should be impossible — `assignParent`
 * rejects them via `wouldCreateCycle` — but a corrupt import or a hand-edited localStorage blob
 * could still introduce one, and an unguarded walk would hang the render loop with no error.
 */

/** Depth no real stone lineage will ever reach; acts purely as a runaway guard. */
const MAX_WALK = 10_000

export function indexById(pieces: Piece[]): Map<string, Piece> {
  const map = new Map<string, Piece>()
  for (const p of pieces) map.set(p.id, p)
  return map
}

export function childrenByParent(pieces: Piece[]): Map<string, Piece[]> {
  const map = new Map<string, Piece[]>()
  for (const p of pieces) {
    if (p.parentId === null) continue
    const bucket = map.get(p.parentId)
    if (bucket) bucket.push(p)
    else map.set(p.parentId, [p])
  }
  return map
}

/** Direct children only, oldest first. */
export function getChildren(pieces: Piece[], id: string): Piece[] {
  return pieces
    .filter((p) => p.parentId === id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

/**
 * The provenance chain, ordered [root, ..., parent]. Excludes the piece itself.
 * Returns [] for a root piece or an unknown id.
 */
export function getAncestors(pieces: Piece[], id: string): Piece[] {
  const byId = indexById(pieces)
  const chain: Piece[] = []
  const seen = new Set<string>([id])

  let current = byId.get(id)
  let guard = 0
  while (current?.parentId && guard++ < MAX_WALK) {
    if (seen.has(current.parentId)) break // cyclic data — stop rather than spin
    seen.add(current.parentId)
    const parent = byId.get(current.parentId)
    if (!parent) break // dangling reference — treat as a root
    chain.push(parent)
    current = parent
  }

  return chain.reverse()
}

/** Every piece below this one, all levels, breadth-first. Excludes the piece itself. */
export function getDescendants(pieces: Piece[], id: string): Piece[] {
  const kids = childrenByParent(pieces)
  const out: Piece[] = []
  const seen = new Set<string>([id])
  const queue: string[] = [id]

  let guard = 0
  while (queue.length > 0 && guard++ < MAX_WALK) {
    const currentId = queue.shift() as string
    for (const child of kids.get(currentId) ?? []) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      out.push(child)
      queue.push(child.id)
    }
  }

  return out
}

/**
 * Nested tree for every root in the set. A piece whose parent is missing from `pieces` is
 * promoted to a root, so filtered subsets still render instead of silently vanishing.
 */
export function buildForest(pieces: Piece[]): TreeNode[] {
  const byId = indexById(pieces)
  const kids = childrenByParent(pieces)

  const build = (piece: Piece, seen: Set<string>): TreeNode => {
    const children: TreeNode[] = []
    for (const child of kids.get(piece.id) ?? []) {
      if (seen.has(child.id)) continue // cyclic data
      seen.add(child.id)
      children.push(build(child, seen))
    }
    children.sort((a, b) => a.piece.createdAt.localeCompare(b.piece.createdAt))
    return { piece, children }
  }

  return pieces
    .filter((p) => p.parentId === null || !byId.has(p.parentId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((root) => build(root, new Set([root.id])))
}

/** Build the tree rooted at a specific piece (used by the family-tree screen). */
export function buildTreeFrom(pieces: Piece[], rootId: string): TreeNode | null {
  const root = indexById(pieces).get(rootId)
  if (!root) return null
  const subtree = [root, ...getDescendants(pieces, rootId)].map((p) =>
    p.id === rootId ? { ...p, parentId: null } : p,
  )
  return buildForest(subtree)[0] ?? null
}

/**
 * Would setting `id`'s parent to `newParentId` create a loop?
 * True when the target is the piece itself or anything already beneath it.
 */
export function wouldCreateCycle(
  pieces: Piece[],
  id: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false
  if (newParentId === id) return true
  return getDescendants(pieces, id).some((d) => d.id === newParentId)
}

/**
 * Recompute `rootId` and `depth` for a piece and everything beneath it, after its parent changed.
 * Returns updated copies of every affected piece (including the changed one); callers persist them.
 *
 * Call this AFTER `parentId` has been set on the piece inside `pieces`.
 */
export function recomputeSubtree(pieces: Piece[], changedId: string): Piece[] {
  const byId = indexById(pieces)
  const changed = byId.get(changedId)
  if (!changed) return []

  const parent = changed.parentId ? byId.get(changed.parentId) : undefined
  const rootId = parent ? parent.rootId : changed.id
  const depth = parent ? parent.depth + 1 : 0

  const kids = childrenByParent(pieces)
  const updated: Piece[] = []
  const seen = new Set<string>([changedId])
  const stack: Array<{ piece: Piece; rootId: string; depth: number }> = [
    { piece: changed, rootId, depth },
  ]

  let guard = 0
  while (stack.length > 0 && guard++ < MAX_WALK) {
    const node = stack.pop() as { piece: Piece; rootId: string; depth: number }
    updated.push({ ...node.piece, rootId: node.rootId, depth: node.depth })
    for (const child of kids.get(node.piece.id) ?? []) {
      if (seen.has(child.id)) continue
      seen.add(child.id)
      stack.push({ piece: child, rootId: node.rootId, depth: node.depth + 1 })
    }
  }

  return updated
}

/** Ids that may not be chosen as a parent for `id` (itself plus all descendants). */
export function invalidParentIds(pieces: Piece[], id: string): Set<string> {
  const set = new Set<string>([id])
  for (const d of getDescendants(pieces, id)) set.add(d.id)
  return set
}
