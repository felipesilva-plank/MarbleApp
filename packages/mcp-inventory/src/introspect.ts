import type { InventoryDb } from './db.js'
import { COLUMN_NOTES } from './schema.js'

export interface ColumnInfo {
  name: string
  type: string
  notNull: boolean
  primaryKey: boolean
  defaultValue: string | null
  references: string | null
  note?: string
}

export interface TableInfo {
  name: string
  kind: 'table' | 'view'
  rowCount: number
  columns: ColumnInfo[]
  indexes: string[]
}

export function listTables(db: InventoryDb): Array<{ name: string; kind: 'table' | 'view' }> {
  return db
    .all(
      `SELECT name, type FROM sqlite_schema
       WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'
       ORDER BY type ASC, name`,
    )
    .map((row) => ({ name: String(row.name), kind: row.type === 'view' ? 'view' : 'table' }))
}

function rowCount(db: InventoryDb, table: string): number {
  const [row] = db.all(`SELECT COUNT(*) AS n FROM "${table}"`)
  return Number(row?.n ?? 0)
}

export function describeTable(db: InventoryDb, table: string): TableInfo {
  const known = listTables(db).find((t) => t.name === table)
  if (!known) {
    const names = listTables(db)
      .map((t) => t.name)
      .join(', ')
    throw new Error(`No table or view called "${table}". Available: ${names}`)
  }

  // PRAGMA returns no rows for a name it does not recognise rather than erroring, which is why the
  // existence check above is separate.
  const foreignKeys = new Map<string, string>()
  for (const fk of db.all(`PRAGMA foreign_key_list("${table}")`)) {
    foreignKeys.set(String(fk.from), `${String(fk.table)}(${String(fk.to)})`)
  }

  const notes = COLUMN_NOTES[table] ?? {}

  const columns: ColumnInfo[] = db.all(`PRAGMA table_info("${table}")`).map((col) => {
    const name = String(col.name)
    return {
      name,
      type: String(col.type || 'ANY'),
      notNull: Number(col.notnull) === 1,
      primaryKey: Number(col.pk) > 0,
      defaultValue: col.dflt_value === null ? null : String(col.dflt_value),
      references: foreignKeys.get(name) ?? null,
      ...(notes[name] ? { note: notes[name] } : {}),
    }
  })

  const indexes = db
    .all(`PRAGMA index_list("${table}")`)
    .map((idx) => `${String(idx.name)}${Number(idx.unique) === 1 ? ' (unique)' : ''}`)

  return { name: table, kind: known.kind, rowCount: rowCount(db, table), columns, indexes }
}

/** The whole schema as one CREATE-statement dump, which is what a model reads fastest. */
export function fullSchema(db: InventoryDb): string {
  return db
    .all(
      `SELECT sql FROM sqlite_schema
       WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
       ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'view' THEN 1 ELSE 2 END, name`,
    )
    .map((row) => `${String(row.sql)};`)
    .join('\n\n')
}

/**
 * A handful of rows, for the model to see the actual shape of the data. Long text is clipped:
 * a single 2,000-character note would otherwise eat the whole sample.
 */
export function sampleRows(db: InventoryDb, table: string, limit = 3): Record<string, unknown>[] {
  return db.all(`SELECT * FROM "${table}" LIMIT ${limit}`).map((row) => {
    const clipped: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      clipped[key] =
        typeof value === 'string' && value.length > 80 ? `${value.slice(0, 77)}...` : value
    }
    return clipped
  })
}
