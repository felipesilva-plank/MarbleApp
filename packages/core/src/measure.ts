import type { Piece } from './types.ts'

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
   * True when the remnants total more area than the slab they came from — which is physically
   * impossible, so it means a dimension was mistyped or a remnant is linked to the wrong slab.
   * The UI flags it as something to check rather than failing the save: the person holding the
   * tape measure is the authority, not this arithmetic.
   */
  overAccounted: boolean
  childCount: number
}

/**
 * Advisory only. Never derive `status` from this.
 *
 * Kerf loss and irregular offcuts make the arithmetic approximate, and the pieces actually sold
 * to a customer are never registered — they leave for the job site instead of going on a rack —
 * so the gap between a slab and its remnants is mostly finished work, not waste. This exists to
 * give a human a sense of "how much of this slab is still here", not to drive state.
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
