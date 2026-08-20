/**
 * stdio entrypoint. Registered in .mcp.json as:
 *
 *   "marble-inventory": {
 *     "command": "npx",
 *     "args": ["-y", "tsx", "packages/mcp-inventory/src/cli/server.ts",
 *              "packages/mcp-inventory/marble.db"]
 *   }
 *
 * Run through tsx rather than compiled to dist/ so this package keeps importing @marble/core
 * directly - the point is that the schema validating the snapshot is the same object the app
 * validates an import with, and a build step would eventually fork them.
 *
 * stdout is the MCP protocol channel and must carry nothing else. Every diagnostic goes to stderr,
 * and node:sqlite's ExperimentalWarning is silenced for exactly that reason - it would otherwise
 * be the first thing a client sees.
 */
process.removeAllListeners('warning')

import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServerFromPath } from '../server.js'

const dbPath = process.argv[2] ?? fileURLToPath(new URL('../../marble.db', import.meta.url))

if (!existsSync(dbPath)) {
  process.stderr.write(
    `marble-mcp-inventory: no snapshot at ${dbPath}\n` +
      `Build one from a MarbleApp backup export (Settings -> Export backup):\n` +
      `  npm run seed --workspace @marble/mcp-inventory -- <backup.json>\n`,
  )
  process.exit(1)
}

const { server, db } = createServerFromPath(dbPath)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    db.close()
    process.exit(0)
  })
}

await server.connect(new StdioServerTransport())
process.stderr.write(`marble-mcp-inventory: serving ${dbPath}\n`)
