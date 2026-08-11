import type { Material, Piece, PieceKind, PieceStatus } from '@marble/core'
import { KEYS, ORG_ID, newId, readJson, writeJson } from './db'
import { writeMaterials } from './materialRepo'
import { writePieces } from './pieceRepo'

/**
 * Demo inventory, written once on first load so a fresh visitor lands on a populated app rather
 * than an empty table. Runs independently of any user — records are stamped 'system'.
 *
 * The shape is chosen to demonstrate the actual problem: a full block -> slab -> remnant chain
 * with known provenance, plus two orphan remnants representing the untracked backlog.
 */

const SEEDED_FLAG = 'v1'

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

interface SeedSpec {
  key: string
  code: string
  kind: PieceKind
  status: PieceStatus
  parentKey: string | null
  materialKey: string
  lengthMm: number
  widthMm: number
  thicknessMm: number
  location: string
  notes: string
  daysAgo: number
}

const MATERIAL_SPECS = [
  { key: 'carrara', name: 'Carrara White', color: 'White with grey veining', finish: 'Polished' },
  { key: 'nero', name: 'Nero Marquina', color: 'Black with white veining', finish: 'Honed' },
  { key: 'verde', name: 'Verde Alpi', color: 'Deep green', finish: 'Polished' },
]

const PIECE_SPECS: SeedSpec[] = [
  {
    key: 'blk1', code: 'BLK-0001', kind: 'block', status: 'consumed', parentKey: null,
    materialKey: 'carrara', lengthMm: 3000, widthMm: 2000, thicknessMm: 1800,
    location: 'Yard A / Bay 1', notes: 'Quarry lot 88-C. Sawn into three slabs.', daysAgo: 60,
  },
  {
    key: 'slb1', code: 'SLB-0001', kind: 'slab', status: 'partially_used', parentKey: 'blk1',
    materialKey: 'carrara', lengthMm: 3000, widthMm: 2000, thicknessMm: 20,
    location: 'Warehouse / Rack 3', notes: 'Kitchen job #1042 cut from this.', daysAgo: 55,
  },
  {
    key: 'slb2', code: 'SLB-0002', kind: 'slab', status: 'partially_used', parentKey: 'blk1',
    materialKey: 'carrara', lengthMm: 3000, widthMm: 2000, thicknessMm: 20,
    location: 'Warehouse / Rack 3', notes: '', daysAgo: 55,
  },
  {
    key: 'slb3', code: 'SLB-0003', kind: 'slab', status: 'available', parentKey: 'blk1',
    materialKey: 'carrara', lengthMm: 3000, widthMm: 1950, thicknessMm: 20,
    location: 'Warehouse / Rack 4', notes: 'Slight edge chip, otherwise full slab.', daysAgo: 55,
  },
  {
    key: 'rmn1', code: 'RMN-0001', kind: 'remnant', status: 'available', parentKey: 'slb1',
    materialKey: 'carrara', lengthMm: 900, widthMm: 600, thicknessMm: 20,
    location: 'Yard A / Rack 1', notes: 'Good for a vanity top.', daysAgo: 40,
  },
  {
    key: 'rmn2', code: 'RMN-0002', kind: 'remnant', status: 'available', parentKey: 'slb1',
    materialKey: 'carrara', lengthMm: 1200, widthMm: 400, thicknessMm: 20,
    location: 'Yard A / Rack 1', notes: '', daysAgo: 40,
  },
  {
    key: 'rmn3', code: 'RMN-0003', kind: 'remnant', status: 'reserved', parentKey: 'slb2',
    materialKey: 'carrara', lengthMm: 800, widthMm: 800, thicknessMm: 20,
    location: 'Yard A / Rack 2', notes: 'Held for job #1102.', daysAgo: 30,
  },
  {
    key: 'rmn4', code: 'RMN-0004', kind: 'remnant', status: 'available', parentKey: 'slb2',
    materialKey: 'carrara', lengthMm: 1100, widthMm: 550, thicknessMm: 20,
    location: 'Yard A / Rack 2', notes: '', daysAgo: 30,
  },
  {
    key: 'rmn5', code: 'RMN-0005', kind: 'remnant', status: 'available', parentKey: 'slb3',
    materialKey: 'carrara', lengthMm: 700, widthMm: 500, thicknessMm: 20,
    location: 'Yard A / Rack 1', notes: '', daysAgo: 12,
  },
  // The backlog this app exists to clear: real stone on the rack, origin never recorded.
  {
    key: 'rmn6', code: 'RMN-0006', kind: 'remnant', status: 'available', parentKey: null,
    materialKey: 'nero', lengthMm: 1000, widthMm: 500, thicknessMm: 20,
    location: 'Yard B / Rack 1', notes: 'Found on the rack. Source slab unknown.', daysAgo: 20,
  },
  {
    key: 'rmn7', code: 'RMN-0007', kind: 'remnant', status: 'available', parentKey: null,
    materialKey: 'verde', lengthMm: 700, widthMm: 700, thicknessMm: 30,
    location: 'Yard B / Rack 2', notes: 'Origin unknown — needs linking.', daysAgo: 18,
  },
]

export function seedIfEmpty(): void {
  if (readJson<string | null>(KEYS.seeded, null) === SEEDED_FLAG) return
  if (readJson<Piece[]>(KEYS.pieces, []).length > 0) return

  const materialIds = new Map<string, string>()
  const materials: Material[] = MATERIAL_SPECS.map((spec) => {
    const id = newId()
    materialIds.set(spec.key, id)
    return {
      id,
      orgId: ORG_ID,
      name: spec.name,
      color: spec.color,
      finish: spec.finish,
      notes: '',
      createdAt: daysAgo(90),
    }
  })

  const ids = new Map<string, string>()
  for (const spec of PIECE_SPECS) ids.set(spec.key, newId())

  const byKey = new Map(PIECE_SPECS.map((spec) => [spec.key, spec]))

  /** Walk up the spec chain to resolve rootId and depth without duplicating the tree logic. */
  const lineage = (spec: SeedSpec): { rootId: string; depth: number } => {
    let depth = 0
    let current = spec
    while (current.parentKey) {
      const parent = byKey.get(current.parentKey)
      if (!parent) break
      depth += 1
      current = parent
    }
    return { rootId: ids.get(current.key) as string, depth }
  }

  const pieces: Piece[] = PIECE_SPECS.map((spec) => {
    const { rootId, depth } = lineage(spec)
    const timestamp = daysAgo(spec.daysAgo)
    return {
      id: ids.get(spec.key) as string,
      orgId: ORG_ID,
      code: spec.code,
      parentId: spec.parentKey ? (ids.get(spec.parentKey) as string) : null,
      rootId,
      depth,
      kind: spec.kind,
      status: spec.status,
      materialId: materialIds.get(spec.materialKey) ?? null,
      lengthMm: spec.lengthMm,
      widthMm: spec.widthMm,
      thicknessMm: spec.thicknessMm,
      location: spec.location,
      hasPhoto: false,
      notes: spec.notes,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: 'system',
    }
  })

  writeMaterials(materials)
  writePieces(pieces)
  writeJson(KEYS.counters, { block: 1, slab: 3, remnant: 7, finished: 0 })
  writeJson(KEYS.seeded, SEEDED_FLAG)
}
