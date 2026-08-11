import type { Piece } from './types'

/** Dimensions are integer millimetres everywhere; convert only at the display edge. */

export type Dimensioned = Pick<Piece, 'lengthMm' | 'widthMm' | 'thicknessMm'>

export function areaM2(p: Pick<Piece, 'lengthMm' | 'widthMm'>): number {
  return (p.lengthMm * p.widthMm) / 1_000_000
}

export function volumeM3(p: Dimensioned): number {
  return (p.lengthMm * p.widthMm * p.thicknessMm) / 1_000_000_000
}

export function totalAreaM2(pieces: Pick<Piece, 'lengthMm' | 'widthMm'>[]): number {
  return pieces.reduce((sum, p) => sum + areaM2(p), 0)
}

export interface ConsumptionSummary {
  parentAreaM2: number
  childrenAreaM2: number
  /** Share of the parent accounted for by registered children. May exceed 100 — see below. */
  accountedPct: number
  /** Parent area minus children area. Negative when over-accounted. */
  unaccountedM2: number
  /**
   * True when children total more area than the parent. Not necessarily an error: a slab sawn
   * from a block yields far more surface area than the block's own footprint. The UI should
   * explain rather than alarm.
   */
  overAccounted: boolean
  childCount: number
}

/**
 * Advisory only. Never derive `status` from this.
 *
 * Kerf loss, irregular offcuts, and the block-to-slab surface multiplication all make the
 * arithmetic approximate. It exists to give a human a sense of "how much of this have I used",
 * not to drive state.
 */
export function consumptionSummary(
  parent: Pick<Piece, 'lengthMm' | 'widthMm'>,
  children: Pick<Piece, 'lengthMm' | 'widthMm'>[],
): ConsumptionSummary {
  const parentAreaM2 = areaM2(parent)
  const childrenAreaM2 = totalAreaM2(children)
  const accountedPct = parentAreaM2 > 0 ? (childrenAreaM2 / parentAreaM2) * 100 : 0

  return {
    parentAreaM2,
    childrenAreaM2,
    accountedPct,
    unaccountedM2: parentAreaM2 - childrenAreaM2,
    overAccounted: childrenAreaM2 > parentAreaM2,
    childCount: children.length,
  }
}

// --- formatting -------------------------------------------------------------

export function formatDimensions(p: Dimensioned): string {
  return `${p.lengthMm} × ${p.widthMm} × ${p.thicknessMm} mm`
}

export function formatArea(m2: number): string {
  return `${m2.toFixed(2)} m²`
}

export function formatVolume(m3: number): string {
  return `${m3.toFixed(3)} m³`
}

export function formatPct(pct: number): string {
  return `${Math.round(pct)}%`
}
