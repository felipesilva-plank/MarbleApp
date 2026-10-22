import { describe, expect, it } from 'vitest'
import { deriveCounters, emptyCounters, nextCode } from './codes.ts'

describe('nextCode', () => {
  it('zero-pads to four digits with a per-kind prefix', () => {
    expect(nextCode('slab', emptyCounters()).code).toBe('SLB-0001')
    expect(nextCode('remnant', emptyCounters()).code).toBe('RMN-0001')
  })

  it('advances only the counter for that kind', () => {
    const { counters } = nextCode('slab', emptyCounters())
    expect(counters).toEqual({ slab: 1, remnant: 0 })
  })

  it('does not mutate the counters it was given', () => {
    const counters = emptyCounters()
    nextCode('slab', counters)
    expect(counters.slab).toBe(0)
  })

  it('keeps counting past four digits without truncating', () => {
    expect(nextCode('slab', { ...emptyCounters(), slab: 9999 }).code).toBe('SLB-10000')
  })
})

describe('deriveCounters', () => {
  it('recovers the high-water mark per kind from existing codes', () => {
    const counters = deriveCounters([
      { code: 'SLB-0042', kind: 'slab' },
      { code: 'SLB-0011', kind: 'slab' },
      { code: 'RMN-0003', kind: 'remnant' },
    ])
    expect(counters).toEqual({ slab: 42, remnant: 3 })
  })

  it('ignores codes whose prefix does not match their kind', () => {
    // Guards against a hand-edited import silently poisoning the counter.
    expect(deriveCounters([{ code: 'RMN-0900', kind: 'slab' }]).slab).toBe(0)
  })

  it('ignores malformed codes', () => {
    expect(deriveCounters([{ code: 'nonsense', kind: 'slab' }]).slab).toBe(0)
  })

  it('lets the next code continue after an import', () => {
    const counters = deriveCounters([{ code: 'SLB-0042', kind: 'slab' }])
    expect(nextCode('slab', counters).code).toBe('SLB-0043')
  })
})
