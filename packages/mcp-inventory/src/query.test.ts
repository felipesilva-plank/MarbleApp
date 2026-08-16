import { rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { createSchema, openDb } from './db.js'
import type { InventoryDb } from './db.js'
import { assertReadOnly, QueryRejected, runQuery, stripLiterals } from './query.js'

describe('stripLiterals', () => {
  it('blanks a single-quoted string so its contents cannot trip the keyword scan', () => {
    expect(stripLiterals("SELECT * FROM pieces WHERE notes = 'please delete me'")).toBe(
      "SELECT * FROM pieces WHERE notes = ''",
    )
  })

  it('handles a doubled quote inside a literal', () => {
    expect(stripLiterals("SELECT 'it''s fine'")).toBe("SELECT ''")
  })

  it('removes line and block comments', () => {
    expect(stripLiterals('SELECT 1 -- drop table pieces').trim()).toBe('SELECT 1')
    expect(stripLiterals('SELECT /* drop table pieces */ 1').replace(/\s+/g, ' ')).toBe('SELECT 1')
  })
})

describe('assertReadOnly', () => {
  it.each([
    'SELECT * FROM pieces',
    'select code from pieces',
    'WITH t AS (SELECT 1 AS n) SELECT * FROM t',
    'SELECT * FROM pieces;',
  ])('allows %s', (sql) => {
    expect(() => assertReadOnly(sql)).not.toThrow()
  })

  it.each([
    ['DELETE FROM pieces', 'DELETE'],
    ['UPDATE pieces SET status = %s', 'UPDATE'],
    ['DROP TABLE pieces', 'DROP'],
    ['INSERT INTO pieces VALUES (1)', 'INSERT'],
    ['PRAGMA table_info(pieces)', 'PRAGMA'],
    ['ATTACH DATABASE %s AS other', 'ATTACH'],
  ])('refuses %s', (sql) => {
    expect(() => assertReadOnly(sql)).toThrow(QueryRejected)
  })

  it('refuses a write smuggled in behind a semicolon', () => {
    expect(() => assertReadOnly('SELECT 1; DROP TABLE pieces')).toThrow(QueryRejected)
  })

  it('refuses a second statement even when both are reads', () => {
    expect(() => assertReadOnly('SELECT 1; SELECT 2')).toThrow(/One statement/)
  })

  it('does not refuse a query whose literal merely contains a keyword', () => {
    expect(() =>
      assertReadOnly("SELECT * FROM pieces WHERE notes LIKE '%update the code%'"),
    ).not.toThrow()
  })

  it('names the offending verb, so the model can correct itself in one turn', () => {
    expect(() => assertReadOnly('DELETE FROM pieces')).toThrow(/DELETE is not allowed/)
  })

  it('refuses an empty query', () => {
    expect(() => assertReadOnly('   ')).toThrow(QueryRejected)
  })
})

describe('runQuery', () => {
  let db: InventoryDb

  beforeEach(() => {
    db = openDb(':memory:')
    createSchema(db)
    db.exec(
      `INSERT INTO materials (id, org_id, name, created_at)
       VALUES ('m1','org_local','Carrara','2026-08-01T00:00:00.000Z')`,
    )
    for (let i = 1; i <= 12; i += 1) {
      const id = `p${i}`
      db.exec(
        `INSERT INTO pieces (id, org_id, code, parent_id, root_id, depth, kind, status, material_id,
         length_mm, width_mm, thickness_mm, location, has_photo, notes, created_at, updated_at, created_by)
         VALUES ('${id}','org_local','RMN-${String(i).padStart(4, '0')}', NULL, '${id}', 0,
         'remnant','available','m1', 1000, 500, 20, 'Rack A', 0, '',
         '2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z','u1')`,
      )
    }
  })

  afterEach(() => db.close())

  it('returns rows for a plain select', () => {
    const result = runQuery(db, 'SELECT code FROM pieces ORDER BY code')
    expect(result.rowCount).toBe(12)
    expect(result.truncated).toBe(false)
    expect(result.rows[0]).toEqual({ code: 'RMN-0001' })
  })

  it('reports truncation rather than silently capping', () => {
    const result = runQuery(db, 'SELECT code FROM pieces', 5)
    expect(result.rowCount).toBe(5)
    expect(result.truncated).toBe(true)
  })

  it('does not claim truncation when the result exactly fills the limit', () => {
    const result = runQuery(db, 'SELECT code FROM pieces LIMIT 5', 5)
    expect(result.truncated).toBe(false)
  })

  it('runs a join across the schema', () => {
    const result = runQuery(
      db,
      'SELECT m.name, COUNT(*) AS n FROM pieces p JOIN materials m ON m.id = p.material_id GROUP BY m.name',
    )
    expect(result.rows).toEqual([{ name: 'Carrara', n: 12 }])
  })

  it('exposes the derived area view rather than making callers redo the arithmetic', () => {
    const result = runQuery(db, "SELECT area_m2 FROM piece_areas WHERE code = 'RMN-0001'")
    expect(result.rows[0]).toEqual({ area_m2: 0.5 })
  })

  it('counts parentless remnants as unlinked', () => {
    expect(runQuery(db, 'SELECT COUNT(*) AS n FROM unlinked_pieces').rows[0]).toEqual({ n: 12 })
  })

  it('does not count a parentless block as unlinked', () => {
    db.exec(
      `INSERT INTO pieces (id, org_id, code, parent_id, root_id, depth, kind, status, material_id,
       length_mm, width_mm, thickness_mm, location, has_photo, notes, created_at, updated_at, created_by)
       VALUES ('b1','org_local','BLK-0001', NULL, 'b1', 0, 'block','available', NULL,
       3000, 2000, 1500, '', 0, '', '2026-08-01T00:00:00.000Z','2026-08-01T00:00:00.000Z','u1')`,
    )
    expect(runQuery(db, 'SELECT COUNT(*) AS n FROM unlinked_pieces').rows[0]).toEqual({ n: 12 })
  })

  it('leaves the data untouched when a write is attempted', () => {
    expect(() => runQuery(db, "DELETE FROM pieces WHERE code = 'RMN-0001'")).toThrow(QueryRejected)
    expect(runQuery(db, 'SELECT COUNT(*) AS n FROM pieces').rows[0]).toEqual({ n: 12 })
  })
})

describe('stripLiterals scanning order', () => {
  /**
   * Regression: stripping string literals before comments let a quote inside a `--` comment pair
   * with a quote on a later line, blanking the semicolon and verb between them.
   */
  it('does not let a quote inside a comment swallow the statement that follows', () => {
    const attack = "SELECT 1 ) LIMIT 1 --'\n; DROP TABLE pieces --'"
    expect(stripLiterals(attack)).toContain(';')
    expect(() => assertReadOnly(attack)).toThrow(QueryRejected)
  })

  it('still ignores a keyword inside a genuine literal', () => {
    expect(() =>
      assertReadOnly("SELECT * FROM pieces WHERE notes = 'drop table pieces'"),
    ).not.toThrow()
  })

  it('handles an escaped quote inside a literal without losing the rest', () => {
    expect(() => assertReadOnly("SELECT * FROM pieces WHERE notes = 'it''s fine'")).not.toThrow()
    // The verb check fires before the statement-count check, so this is a DROP rejection.
    expect(() => assertReadOnly("SELECT 'a''b'; DROP TABLE pieces")).toThrow(/DROP is not allowed/)
    expect(() => assertReadOnly("SELECT 'a''b'; SELECT 2")).toThrow(/One statement/)
  })

  it('blanks a block comment without joining the code either side into one token', () => {
    expect(stripLiterals('SELECT/**/1').replace(/\s+/g, ' ')).toBe('SELECT 1')
  })
})

describe('read-only connection', () => {
  it('refuses a write even when the SQL guard is bypassed entirely', () => {
    const path = `${tmpdir()}/marble-readonly-${process.pid}.db`
    rmSync(path, { force: true })

    const writable = openDb(path)
    createSchema(writable)
    writable.close()

    const readonly = openDb(path, { readOnly: true })
    // db.exec is the guard-free path the server never exposes - this is the second line of defence.
    expect(() => readonly.exec("INSERT INTO materials (id, org_id, name, created_at) VALUES ('a','b','c','d')")).toThrow()
    expect(readonly.all('SELECT COUNT(*) AS n FROM materials')[0]).toEqual({ n: 0 })
    readonly.close()
    rmSync(path, { force: true })
  })
})
