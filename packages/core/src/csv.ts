/**
 * CSV writing. Framework-free so the future API can serve the same export from a report endpoint.
 *
 * The two things that make hand-rolled CSV wrong in practice, both handled here: a value
 * containing a comma, quote or newline must be quoted with doubled quotes, and Excel decides the
 * encoding of a file with no BOM by guessing - which turns "Mármore" into "MÃ¡rmore" for every
 * Portuguese material name in the yard.
 */

export interface CsvColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

/** RFC 4180: quote when the value contains a delimiter, a quote or a line break. */
function escapeCell(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return ''
  const value = String(raw)
  if (!/[",\r\n]/.test(value)) return value
  return `"${value.replace(/"/g, '""')}"`
}

export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => escapeCell(c.value(row))).join(','))
  }
  // CRLF, also RFC 4180. Excel is the consumer here and it is the fussy one.
  return lines.join('\r\n')
}

/** U+FEFF. Without it Excel guesses the encoding and mangles every accented character. */
export const UTF8_BOM = '﻿'

export function toCsvFile<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  return UTF8_BOM + toCsv(rows, columns)
}
