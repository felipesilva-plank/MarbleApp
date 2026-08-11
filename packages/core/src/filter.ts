import { DERIVED_KINDS } from './types'
import type { Piece, PieceFilter } from './types'

/**
 * A piece that should have a source but has none — the untracked backlog.
 * Deliberately excludes blocks and slabs, which can legitimately have no parent.
 */
export function isUnlinked(piece: Pick<Piece, 'parentId' | 'kind'>): boolean {
  return piece.parentId === null && DERIVED_KINDS.includes(piece.kind)
}

/**
 * Pure filter predicate, shared by the localStorage adapter today and reusable for tests or an
 * in-memory API later. When Postgres arrives this becomes a WHERE clause — the shape of
 * `PieceFilter` is deliberately one-column-per-field so that translation is mechanical.
 */
export function matchesFilter(piece: Piece, filter: PieceFilter = {}): boolean {
  if (filter.kind && piece.kind !== filter.kind) return false
  if (filter.status && piece.status !== filter.status) return false
  if (filter.materialId && piece.materialId !== filter.materialId) return false
  if (filter.rootId && piece.rootId !== filter.rootId) return false
  if (filter.parentId !== undefined && filter.parentId !== null && piece.parentId !== filter.parentId) {
    return false
  }
  if (filter.orphansOnly && !isUnlinked(piece)) return false
  if (filter.location && !piece.location.toLowerCase().includes(filter.location.toLowerCase())) {
    return false
  }

  // Dimension floors: a remnant qualifies if it fits either way round, since stone can be rotated.
  if (filter.minLengthMm || filter.minWidthMm) {
    const needL = filter.minLengthMm ?? 0
    const needW = filter.minWidthMm ?? 0
    const fitsDirect = piece.lengthMm >= needL && piece.widthMm >= needW
    const fitsRotated = piece.lengthMm >= needW && piece.widthMm >= needL
    if (!fitsDirect && !fitsRotated) return false
  }

  if (filter.thicknessMm && piece.thicknessMm !== filter.thicknessMm) return false

  if (filter.q) {
    const needle = filter.q.trim().toLowerCase()
    if (needle) {
      const haystack = [piece.code, piece.location, piece.notes].join(' ').toLowerCase()
      if (!haystack.includes(needle)) return false
    }
  }

  return true
}

export function applyFilter(pieces: Piece[], filter: PieceFilter = {}): Piece[] {
  return pieces.filter((p) => matchesFilter(p, filter))
}
