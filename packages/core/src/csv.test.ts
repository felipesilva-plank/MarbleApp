import { describe, expect, it } from 'vitest'
import { toCsv, toCsvFile, UTF8_BOM } from './csv'
import type { CsvColumn } from './csv'

interface Row {
  code: string
  notes: string
  length: number | null
}

const columns: CsvColumn<Row>[] = [
  { header: 'Code', value: (r) => r.code },
  { header: 'Notes', value: (r) => r.notes },
  { header: 'Length (mm)', value: (r) => r.length },
]

function row(overrides: Partial<Row> = {}): Row {
  return { code: 'SLB-0001', notes: '', length: 3200, ...overrides }
}

describe('toCsv', () => {
  it('writes a header even with no rows', () => {
    expect(toCsv([], columns)).toBe('Code,Notes,Length (mm)')
  })

  it('separates records with CRLF, which is what Excel expects', () => {
    expect(toCsv([row()], columns)).toBe('Code,Notes,Length (mm)\r\nSLB-0001,,3200')
  })

  it('quotes a value containing a comma', () => {
    expect(toCsv([row({ notes: 'chipped, rear left' })], columns)).toContain('"chipped, rear left"')
  })

  it('doubles embedded quotes rather than dropping them', () => {
    expect(toCsv([row({ notes: 'marked "reject"' })], columns)).toContain('"marked ""reject"""')
  })

  it('quotes a value containing a newline so the row does not split', () => {
    const out = toCsv([row({ notes: 'line one\nline two' })], columns)
    expect(out).toContain('"line one\nline two"')
    expect(out.split('\r\n')).toHaveLength(2)
  })

  it('renders null as empty rather than the string "null"', () => {
    expect(toCsv([row({ length: null })], columns)).toBe('Code,Notes,Length (mm)\r\nSLB-0001,,')
  })
})

describe('toCsvFile', () => {
  it('prefixes a BOM so Excel does not mangle accented material names', () => {
    const out = toCsvFile([row({ notes: 'Mármore fino' })], columns)
    expect(out.startsWith(UTF8_BOM)).toBe(true)
    expect(out).toContain('Mármore fino')
  })
})
