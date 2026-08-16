/**
 * Build the snapshot from a MarbleApp backup export (Settings -> Export backup).
 *
 *   npm run seed --workspace @marble/mcp-inventory -- ~/Downloads/marbleapp-backup-2026-08-16.json
 *
 * Rebuilds from scratch every time, and deletes a half-written file on failure. The snapshot is
 * disposable by design - it is a read model, and a stale one that looks current is worse than none
 * at all.
 */
process.removeAllListeners('warning')

import { existsSync, readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createSchema, loadBackup, openDb } from '../db.js'

const [input, output = fileURLToPath(new URL('../../marble.db', import.meta.url))] =
  process.argv.slice(2)

if (!input) {
  process.stderr.write('usage: seed.ts <backup.json> [out.db]\n')
  process.exit(1)
}

if (!existsSync(input)) {
  process.stderr.write(`No backup file at ${input}\n`)
  process.exit(1)
}

rmSync(output, { force: true })

const db = openDb(output)
createSchema(db)

try {
  const { pieces, materials } = loadBackup(db, readFileSync(input, 'utf8'))
  db.close()
  process.stdout.write(`Wrote ${pieces} pieces and ${materials} materials to ${output}\n`)
} catch (error) {
  db.close()
  rmSync(output, { force: true })
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
}
