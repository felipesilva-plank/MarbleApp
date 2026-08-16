import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSchema, loadBackup, openDb } from './db.js'
import type { InventoryDb } from './db.js'
import { createServer } from './server.js'

/**
 * Driven through a real MCP client over an in-memory transport rather than by calling the handlers
 * directly. The handlers were never the risky part - tool registration, schema shape and the
 * content envelope are, and only a real client exercises those.
 */

function backupJson() {
  const stamp = '2026-08-16T09:00:00.000Z'
  const piece = (over: Record<string, unknown>) => ({
    id: 'x',
    orgId: 'org_local',
    code: 'X',
    parentId: null,
    rootId: 'x',
    depth: 0,
    kind: 'remnant',
    status: 'available',
    materialId: null,
    lengthMm: 1000,
    widthMm: 500,
    thicknessMm: 20,
    location: 'Rack A',
    hasPhoto: false,
    notes: '',
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: 'u1',
    ...over,
  })

  return JSON.stringify({
    version: 1,
    exportedAt: stamp,
    materials: [
      {
        id: 'm1',
        orgId: 'org_local',
        name: 'Mármore Carrara',
        color: 'White',
        finish: 'Polished',
        notes: '',
        createdAt: stamp,
      },
    ],
    counters: { block: 1, slab: 1, remnant: 2, finished: 0 },
    pieces: [
      piece({ id: 'b1', code: 'BLK-0001', kind: 'block', rootId: 'b1', materialId: 'm1' }),
      piece({
        id: 's1',
        code: 'SLB-0001',
        kind: 'slab',
        parentId: 'b1',
        rootId: 'b1',
        depth: 1,
        materialId: 'm1',
      }),
      piece({
        id: 'r1',
        code: 'RMN-0001',
        parentId: 's1',
        rootId: 'b1',
        depth: 2,
        materialId: 'm1',
      }),
      // No parent, and a kind that should have one: the backlog this app exists to shrink.
      piece({ id: 'r2', code: 'RMN-0002', rootId: 'r2' }),
    ],
  })
}

async function connect(db: InventoryDb) {
  const client = new Client({ name: 'test', version: '0.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await Promise.all([
    createServer(db).connect(serverTransport),
    client.connect(clientTransport),
  ])
  return client
}

function textOf(result: unknown): string {
  const content = (result as { content: Array<{ type: string; text?: string }> }).content
  return content.map((c) => c.text ?? '').join('')
}

describe('marble-inventory MCP server', () => {
  let db: InventoryDb
  let client: Client

  beforeEach(async () => {
    db = openDb(':memory:')
    createSchema(db)
    loadBackup(db, backupJson())
    client = await connect(db)
  })

  afterEach(async () => {
    await client.close()
    db.close()
  })

  it('advertises exactly the three tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(['describe-table', 'query', 'schema'])
  })

  it('answers a grouped count over real lineage', async () => {
    const result = await client.callTool({
      name: 'query',
      arguments: { sql: 'SELECT kind, COUNT(*) AS n FROM pieces GROUP BY kind ORDER BY kind' },
    })
    expect(JSON.parse(textOf(result))).toEqual([
      { kind: 'block', n: 1 },
      { kind: 'remnant', n: 2 },
      { kind: 'slab', n: 1 },
    ])
  })

  it('finds the piece whose origin was never recorded', async () => {
    const result = await client.callTool({
      name: 'query',
      arguments: { sql: 'SELECT code FROM unlinked_pieces' },
    })
    expect(JSON.parse(textOf(result))).toEqual([{ code: 'RMN-0002' }])
  })

  it('refuses a write and says which verb was the problem', async () => {
    const result = await client.callTool({
      name: 'query',
      arguments: { sql: 'DELETE FROM pieces' },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/DELETE is not allowed/)
  })

  it('hands back the table list when a query names a table that does not exist', async () => {
    const result = await client.callTool({
      name: 'query',
      arguments: { sql: 'SELECT * FROM slabs' },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toContain('pieces')
  })

  it('returns the schema including both derived views', async () => {
    const sql = textOf(await client.callTool({ name: 'schema', arguments: {} }))
    expect(sql).toContain('CREATE TABLE pieces')
    expect(sql).toContain('CREATE VIEW piece_areas')
    expect(sql).toContain('CREATE VIEW unlinked_pieces')
  })

  it('describes a table with foreign keys, notes and samples', async () => {
    const info = JSON.parse(
      textOf(await client.callTool({ name: 'describe-table', arguments: { table: 'pieces' } })),
    )
    expect(info.rowCount).toBe(4)
    const parent = info.columns.find((c: { name: string }) => c.name === 'parent_id')
    expect(parent.references).toBe('pieces(id)')
    expect(parent.note).toMatch(/never recorded/)
    expect(info.samples).toHaveLength(3)
  })

  it('names the available tables when asked about one that does not exist', async () => {
    const result = await client.callTool({
      name: 'describe-table',
      arguments: { table: 'nope' },
    })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/Available: .*pieces/)
  })

  it('exposes the table list as a resource', async () => {
    const { contents } = await client.readResource({ uri: 'marble://tables' })
    // The SDK types a content entry as text-or-blob; this resource is declared application/json.
    const entry = contents[0]
    expect('text' in entry).toBe(true)
    const tables = JSON.parse((entry as { text: string }).text)
    expect(tables).toContainEqual({ name: 'pieces', kind: 'table', rowCount: 4 })
    expect(tables).toContainEqual({ name: 'unlinked_pieces', kind: 'view', rowCount: 1 })
  })

  it('preserves accented material names through the snapshot', async () => {
    const result = await client.callTool({
      name: 'query',
      arguments: { sql: 'SELECT name FROM materials' },
    })
    expect(JSON.parse(textOf(result))).toEqual([{ name: 'Mármore Carrara' }])
  })
})

describe('loadBackup', () => {
  it('rejects a file that is not a MarbleApp backup, naming the field', () => {
    const db = openDb(':memory:')
    createSchema(db)
    expect(() => loadBackup(db, '{"version":1}')).toThrow(/Not a MarbleApp backup/)
    db.close()
  })

  it('inserts parents before children despite input order', () => {
    const db = openDb(':memory:')
    createSchema(db)
    // The fixture lists the block first; reverse it so a naive loader would violate the FK.
    const parsed = JSON.parse(backupJson())
    parsed.pieces.reverse()
    expect(() => loadBackup(db, JSON.stringify(parsed))).not.toThrow()
    db.close()
  })
})
