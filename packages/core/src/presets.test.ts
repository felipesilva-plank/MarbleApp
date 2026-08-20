import { describe, expect, it } from 'vitest'
import { describeQuery, hasAnyFilter, isSameFilter, normalizeQuery, slugify } from './presets'

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Thick offcuts')).toBe('thick-offcuts')
  })

  it('strips accents so Portuguese names round-trip', () => {
    expect(slugify('Mármore fino')).toBe('marmore-fino')
    expect(slugify('Marmore fino')).toBe('marmore-fino')
  })

  it('collapses punctuation runs and trims the edges', () => {
    expect(slugify('  --Big!! slabs -- ')).toBe('big-slabs')
  })

  it('never returns an empty slug', () => {
    expect(slugify('!!!')).toBe('preset')
  })
})

describe('normalizeQuery', () => {
  it('sorts keys so click order does not change the identity of a filter', () => {
    expect(normalizeQuery('t=30&kind=remnant')).toBe(normalizeQuery('kind=remnant&t=30'))
  })

  it('drops params that carry no filtering meaning', () => {
    expect(normalizeQuery('view=grid&kind=slab')).toBe('kind=slab')
  })

  it('drops empty values', () => {
    expect(normalizeQuery('kind=&status=available')).toBe('status=available')
  })
})

describe('hasAnyFilter', () => {
  it('is false for a bare view switch', () => {
    expect(hasAnyFilter('view=grid')).toBe(false)
  })

  it('is false for an empty query', () => {
    expect(hasAnyFilter('')).toBe(false)
  })

  it('is true once a real filter is set', () => {
    expect(hasAnyFilter('view=grid&unlinked=1')).toBe(true)
  })
})

describe('isSameFilter', () => {
  it('ignores order and non-filter params', () => {
    expect(isSameFilter('kind=slab&view=grid', 'view=table&kind=slab')).toBe(true)
  })

  it('separates genuinely different filters', () => {
    expect(isSameFilter('kind=slab', 'kind=block')).toBe(false)
  })
})

describe('describeQuery', () => {
  it('renders labels a fabricator would recognise', () => {
    expect(describeQuery('kind=remnant&status=available&t=30')).toBe(
      'Remnant · Available · 30 mm thick',
    )
  })

  it('resolves a material id through the supplied lookup', () => {
    expect(describeQuery('material=m1', (id) => (id === 'm1' ? 'Carrara' : undefined))).toBe(
      'Carrara',
    )
  })

  it('says so rather than guessing when the material is gone', () => {
    expect(describeQuery('material=deleted')).toBe('Unknown material')
  })

  it('describes an empty filter honestly', () => {
    expect(describeQuery('view=grid')).toBe('No filters')
  })

  it('renders a size floor', () => {
    expect(describeQuery('minL=1200&minW=600')).toBe('At least 1200 x 600 mm')
  })
})
