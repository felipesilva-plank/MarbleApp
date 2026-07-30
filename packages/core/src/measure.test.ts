import { describe, expect, it } from 'vitest'
import { areaM2, consumptionSummary, formatArea, formatDimensions, volumeM3 } from './measure'
import { makePiece } from './test-utils'

describe('areaM2 / volumeM3', () => {
  it('converts square millimetres to square metres', () => {
    expect(areaM2({ lengthMm: 3000, widthMm: 2000 })).toBe(6)
  })

  it('converts cubic millimetres to cubic metres', () => {
    expect(volumeM3({ lengthMm: 1000, widthMm: 1000, thicknessMm: 1000 })).toBe(1)
  })
})

describe('consumptionSummary', () => {
  const parent = makePiece({ id: 'p', lengthMm: 3000, widthMm: 2000 }) // 6 m²

  it('reports the share accounted for by children', () => {
    const children = [
      makePiece({ id: 'a', lengthMm: 1500, widthMm: 2000 }), // 3 m²
      makePiece({ id: 'b', lengthMm: 750, widthMm: 2000 }), // 1.5 m²
    ]
    const summary = consumptionSummary(parent, children)

    expect(summary.parentAreaM2).toBe(6)
    expect(summary.childrenAreaM2).toBe(4.5)
    expect(summary.accountedPct).toBe(75)
    expect(summary.unaccountedM2).toBe(1.5)
    expect(summary.overAccounted).toBe(false)
    expect(summary.childCount).toBe(2)
  })

  it('flags over-accounting instead of clamping', () => {
    // Real case: slabs sawn from a block have far more surface area than the block's footprint.
    const children = [makePiece({ id: 'a', lengthMm: 3000, widthMm: 3000 })] // 9 m²
    const summary = consumptionSummary(parent, children)

    expect(summary.overAccounted).toBe(true)
    expect(summary.accountedPct).toBe(150)
    expect(summary.unaccountedM2).toBe(-3)
  })

  it('reports zero rather than NaN when the parent has no area', () => {
    const summary = consumptionSummary({ lengthMm: 0, widthMm: 0 }, [])
    expect(summary.accountedPct).toBe(0)
    expect(Number.isNaN(summary.accountedPct)).toBe(false)
  })

  it('handles a parent with no children', () => {
    const summary = consumptionSummary(parent, [])
    expect(summary.childrenAreaM2).toBe(0)
    expect(summary.unaccountedM2).toBe(6)
  })
})

describe('formatting', () => {
  it('formats dimensions the way the trade writes them', () => {
    expect(formatDimensions({ lengthMm: 3200, widthMm: 1900, thicknessMm: 20 })).toBe(
      '3200 × 1900 × 20 mm',
    )
  })

  it('formats area to two decimals', () => {
    expect(formatArea(6)).toBe('6.00 m²')
  })
})
