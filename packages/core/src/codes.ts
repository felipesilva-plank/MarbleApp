import type { Counters, Piece, PieceKind } from './types'

const PREFIX: Record<PieceKind, string> = {
  block: 'BLK',
  slab: 'SLB',
  remnant: 'RMN',
  finished: 'FIN',
}

const CODE_PATTERN = /^([A-Z]{3})-(\d+)$/

export function emptyCounters(): Counters {
  return { block: 0, slab: 0, remnant: 0, finished: 0 }
}

/**
 * Next human-readable code for a kind, e.g. 'SLB-0042'.
 * Pure: returns the code and the advanced counters rather than mutating.
 */
export function nextCode(kind: PieceKind, counters: Counters): { code: string; counters: Counters } {
  const n = (counters[kind] ?? 0) + 1
  return {
    code: `${PREFIX[kind]}-${String(n).padStart(4, '0')}`,
    counters: { ...counters, [kind]: n },
  }
}

/**
 * Rebuild counters from existing codes. Run after importing a backup, otherwise the next
 * generated code would collide with an imported one.
 */
export function deriveCounters(pieces: Pick<Piece, 'code' | 'kind'>[]): Counters {
  const counters = emptyCounters()
  for (const piece of pieces) {
    const match = CODE_PATTERN.exec(piece.code)
    if (!match) continue
    const [, prefix, digits] = match
    if (PREFIX[piece.kind] !== prefix) continue
    const n = Number.parseInt(digits, 10)
    if (Number.isFinite(n) && n > counters[piece.kind]) counters[piece.kind] = n
  }
  return counters
}

export function codePrefix(kind: PieceKind): string {
  return PREFIX[kind]
}
