import type { InventoryDb, Row } from './db.js'

/**
 * Read-only enforcement.
 *
 * The database is a throwaway snapshot, so a write here destroys nothing important. The reason to
 * refuse anyway is behavioural: an agent that discovers it can UPDATE will start "fixing" the data
 * to make its answer come out, and you will never see it happen. Refusing turns that into an error
 * message instead of a silent divergence from the app's real state.
 *
 * Defence in depth - the connection could also be opened read-only, but a clear refusal is a much
 * better signal to the model than SQLITE_READONLY.
 */

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|TRUNCATE|ATTACH|DETACH|PRAGMA|VACUUM|REINDEX|BEGIN|COMMIT|ROLLBACK)\b/i

export const MAX_ROWS = 500

export class QueryRejected extends Error {}

/**
 * Blanks string literals and comments so a piece note containing the word "delete" is not a hit.
 *
 * ONE left-to-right scan, not a sequence of regex passes. Stripping literals first let a quote
 * inside a `--` comment pair with a quote on a later line, and the regex then swallowed everything
 * between them - including a semicolon and a forbidden verb. This got through:
 *
 *     SELECT 1 ) LIMIT 1 --'
 *     ; DROP TABLE pieces --'
 *
 * A scanner cannot have that bug, because at every character it knows which construct it is
 * inside.
 */
export function stripLiterals(sql: string): string {
  let out = ''
  let i = 0

  while (i < sql.length) {
    const char = sql[i]
    const next = sql[i + 1]

    if (char === "'" || char === '"') {
      const quote = char
      out += quote + quote
      i += 1
      while (i < sql.length) {
        if (sql[i] === quote) {
          // A doubled quote is an escaped quote, not the end of the literal.
          if (sql[i + 1] === quote) i += 2
          else {
            i += 1
            break
          }
        } else i += 1
      }
      continue
    }

    if (char === '-' && next === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1
      out += ' '
      continue
    }

    if (char === '/' && next === '*') {
      i += 2
      while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1
      i += 2
      out += ' '
      continue
    }

    out += char
    i += 1
  }

  return out
}

export function assertReadOnly(sql: string): void {
  const bare = stripLiterals(sql).trim()

  if (bare.length === 0) {
    throw new QueryRejected('Empty query.')
  }

  // Verb check first, so a leading DELETE gets "DELETE is not allowed" rather than the generic
  // "only SELECT" message. Naming the thing it did wrong is what lets the model fix it in one turn
  // instead of guessing at the rule.
  if (FORBIDDEN.test(bare)) {
    const verb = bare.match(FORBIDDEN)?.[0]?.toUpperCase()
    throw new QueryRejected(
      `${verb} is not allowed. This is a read-only snapshot - to change data, use the app.`,
    )
  }

  if (!/^(SELECT|WITH)\b/i.test(bare)) {
    throw new QueryRejected(
      'Only SELECT (or WITH ... SELECT) is allowed. This is a read-only snapshot of the inventory.',
    )
  }

  // Two statements means the second one is doing something the first hid.
  const withoutTrailing = bare.replace(/;\s*$/, '')
  if (withoutTrailing.includes(';')) {
    throw new QueryRejected('One statement per query.')
  }
}

export interface QueryResult {
  rows: Row[]
  rowCount: number
  truncated: boolean
}

export function runQuery(db: InventoryDb, sql: string, limit = MAX_ROWS): QueryResult {
  assertReadOnly(sql)

  // Over-fetch by one so truncation is detectable rather than guessed at. Telling the model its
  // result was cut off matters more than the rows themselves - a silent cap produces a confident
  // wrong total.
  const rows = db.all(`SELECT * FROM (${sql.replace(/;\s*$/, '')}) LIMIT ${limit + 1}`)

  return {
    rows: rows.slice(0, limit),
    rowCount: Math.min(rows.length, limit),
    truncated: rows.length > limit,
  }
}
