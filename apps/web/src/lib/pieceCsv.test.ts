import { describe, expect, it } from 'vitest'
import { toCsvFile } from '@marble/core'
import type { Material, Piece } from '@marble/core'
import { pieceCsvColumns, pieceCsvLookups } from './pieceCsv'

function piece(overrides: Partial<Piece> = {}): Piece {
  return {
    id: 'p1',
    orgId: 'org_local',
    code: 'RMN-0001',
    parentId: null,
    rootId: 'p1',
    depth: 0,
    kind: 'remnant',
    status: 'available',
    materialId: null,
    lengthMm: 1200,
    widthMm: 600,
    thicknessMm: 20,
    location: 'Rack A',
    hasPhoto: false,
    notes: '',
    createdAt: '2026-08-15T09:00:00.000Z',
    updatedAt: '2026-08-15T09:00:00.000Z',
    createdBy: 'u1',
    ...overrides,
  }
}

const material: Material = {
  id: 'm1',
  orgId: 'org_local',
  name: 'Mármore Carrara',
  color: 'White',
  finish: 'Polished',
  notes: '',
  createdAt: '2026-08-01T00:00:00.000Z',
}

function build(rows: Piece[], all: Piece[] = rows) {
  const lookups = pieceCsvLookups(all, [material])
  return toCsvFile(rows, pieceCsvColumns(lookups.materialName, lookups.codeOf))
}

describe('piece CSV export', () => {
  it('writes the parent code, not its id', () => {
    const parent = piece({ id: 'p0', code: 'SLB-0009' })
    const child = piece({ id: 'p1', code: 'RMN-0001', parentId: 'p0', depth: 1 })
    expect(build([child], [parent, child])).toContain(',SLB-0009,')
  })

  it('resolves a parent that is outside the exported rows', () => {
    const parent = piece({ id: 'p0', code: 'BLK-0001' })
    const child = piece({ id: 'p1', parentId: 'p0', depth: 1 })
    // Only the child is exported, but the lookup gets the full inventory.
    expect(build([child], [parent, child])).toContain(',BLK-0001,')
  })

  it('leaves "Cut from" blank when the parent was deleted', () => {
    const orphaned = piece({ parentId: 'gone' })
    const line = build([orphaned]).split('\r\n')[1]
    expect(line.split(',')[9]).toBe('')
  })

  it('marks a parentless remnant as having no recorded origin', () => {
    expect(build([piece({ kind: 'remnant', parentId: null })])).toContain(',no,')
  })

  it('does not mark a parentless block as missing an origin', () => {
    expect(build([piece({ kind: 'block', parentId: null })])).toContain(',yes,')
  })

  it('keeps accented material names intact behind the BOM', () => {
    const out = build([piece({ materialId: 'm1' })])
    expect(out).toContain('Mármore Carrara')
    expect(out.charCodeAt(0)).toBe(0xfeff)
  })

  it('quotes notes containing a comma so columns do not shift', () => {
    expect(build([piece({ notes: 'chipped, rear left' })])).toContain('"chipped, rear left"')
  })
})
