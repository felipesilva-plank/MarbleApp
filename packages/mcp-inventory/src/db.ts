import { DatabaseSync } from 'node:sqlite'
import { backupSchema } from '@marble/core'
import { SCHEMA_SQL } from './schema.js'

/**
 * node:sqlite rather than better-sqlite3: no native build step, so `npm ci` on a fresh machine
 * cannot fail on a compiler toolchain. It needs Node >= 22.5, which is why this package pins its
 * own engines field.
 */

export type Row = Record<string, unknown>

export interface InventoryDb {
  all(sql: string, params?: unknown[]): Row[]
  exec(sql: string): void
  close(): void
}

export function openDb(path: string): InventoryDb {
  const db = new DatabaseSync(path)
  // Enforce the parent_id/material_id references. Off by default in SQLite, which is how dangling
  // foreign keys quietly accumulate.
  db.exec('PRAGMA foreign_keys = ON')
  return {
    all: (sql, params = []) => db.prepare(sql).all(...(params as [])) as Row[],
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
  }
}

export function createSchema(db: InventoryDb): void {
  db.exec(SCHEMA_SQL)
}

/**
 * Load a MarbleApp backup export (Settings -> Export) into a fresh database.
 *
 * The export is validated with the app's own `backupSchema` first. That is not ceremony: this file
 * is the seam where hand-edited JSON becomes something an agent runs SQL against, and a silently
 * malformed row here produces a confidently wrong answer later.
 *
 * Materials are inserted before pieces, and pieces are inserted parent-first, because foreign keys
 * are on.
 */
export function loadBackup(db: InventoryDb, json: string): { pieces: number; materials: number } {
  const parsed = backupSchema.safeParse(JSON.parse(json))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    throw new Error(
      `Not a MarbleApp backup (${issue?.path.join('.') || 'root'}: ${issue?.message ?? 'unexpected shape'})`,
    )
  }

  const backup = parsed.data

  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const lit = (value: string | null) => (value === null ? 'NULL' : quote(value))

  db.exec('BEGIN')
  try {
    for (const m of backup.materials) {
      db.exec(
        `INSERT INTO materials (id, org_id, name, color, finish, notes, created_at) VALUES (` +
          [m.id, m.orgId, m.name, m.color, m.finish, m.notes, m.createdAt].map(quote).join(', ') +
          `)`,
      )
    }

    // Depth ascending guarantees a parent is inserted before its children.
    for (const p of [...backup.pieces].sort((a, b) => a.depth - b.depth)) {
      db.exec(
        `INSERT INTO pieces (id, org_id, code, parent_id, root_id, depth, kind, status, material_id,` +
          ` length_mm, width_mm, thickness_mm, location, has_photo, notes, created_at, updated_at, created_by)` +
          ` VALUES (${quote(p.id)}, ${quote(p.orgId)}, ${quote(p.code)}, ${lit(p.parentId)},` +
          ` ${quote(p.rootId)}, ${p.depth}, ${quote(p.kind)}, ${quote(p.status)}, ${lit(p.materialId)},` +
          ` ${p.lengthMm}, ${p.widthMm}, ${p.thicknessMm}, ${quote(p.location)}, ${p.hasPhoto ? 1 : 0},` +
          ` ${quote(p.notes)}, ${quote(p.createdAt)}, ${quote(p.updatedAt)}, ${quote(p.createdBy)})`,
      )
    }

    for (const preset of backup.presets ?? []) {
      db.exec(
        `INSERT INTO filter_presets (id, org_id, name, slug, query, created_at) VALUES (` +
          [preset.id, preset.orgId, preset.name, preset.slug, preset.query, preset.createdAt]
            .map(quote)
            .join(', ') +
          `)`,
      )
    }

    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }

  return { pieces: backup.pieces.length, materials: backup.materials.length }
}
