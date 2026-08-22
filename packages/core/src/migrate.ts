import { z } from 'zod'
import { backupSchema, materialRecordSchema, pieceStatusSchema } from './schemas.ts'
import { filterPresetRecordSchema } from './presets.ts'
import type { Backup } from './schemas.ts'
import { deriveCounters } from './codes.ts'
import type { PieceKind, RemnantOrigin } from './types.ts'

/**
 * Backups written before the model was corrected.
 *
 * The v1 app had four kinds — `block`, `slab`, `remnant`, `finished` — which turned out not to
 * match how a shop works: nobody handles blocks (that happens upstream at the quarry) and a
 * finished piece is delivered to the customer rather than racked. See README → Domain model.
 *
 * Those exports are the only copy of the data the MVP collected, so they have to keep importing.
 */
const legacyKindSchema = z.enum(['block', 'slab', 'remnant', 'finished'])

const legacyPieceSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  code: z.string(),
  parentId: z.string().nullable(),
  rootId: z.string(),
  depth: z.number().int().min(0),
  kind: legacyKindSchema,
  status: pieceStatusSchema,
  materialId: z.string().nullable(),
  lengthMm: z.number().int().positive(),
  widthMm: z.number().int().positive(),
  thicknessMm: z.number().int().positive(),
  location: z.string(),
  hasPhoto: z.boolean(),
  notes: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string(),
})

const legacyBackupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.string(),
  pieces: z.array(legacyPieceSchema),
  materials: z.array(materialRecordSchema),
  counters: z.object({
    block: z.number().int().min(0),
    slab: z.number().int().min(0),
    remnant: z.number().int().min(0),
    finished: z.number().int().min(0),
  }),
  photos: z.record(z.string(), z.string()).optional(),
  presets: z.array(filterPresetRecordSchema).optional(),
})

type LegacyKind = z.infer<typeof legacyKindSchema>

/**
 * How each retired kind lands in the two-kind model.
 *
 * - `block` → `slab`. A block only ever appeared in a v1 inventory as the thing slabs were sawn
 *   from. Keeping it as a slab preserves the lineage links hanging off it; deleting it would
 *   orphan every slab underneath and destroy exactly the provenance this app exists to keep.
 * - `finished` → a `rejected` remnant. That is what a finished piece *is* once it is back in the
 *   building and still in the system: something a future job can be cut from.
 */
const KIND_MAP: Record<LegacyKind, { kind: PieceKind; remnantOrigin: RemnantOrigin | null }> = {
  block: { kind: 'slab', remnantOrigin: null },
  slab: { kind: 'slab', remnantOrigin: null },
  remnant: { kind: 'remnant', remnantOrigin: 'offcut' },
  finished: { kind: 'remnant', remnantOrigin: 'rejected' },
}

/** Codes are never rewritten — 'BLK-0001' stays on the label stuck to the stone in the yard. */
export function migrateLegacyBackup(input: unknown): Backup | null {
  const legacy = legacyBackupSchema.safeParse(input)
  if (!legacy.success) return null

  const pieces = legacy.data.pieces.map((piece) => {
    const { kind, remnantOrigin } = KIND_MAP[piece.kind]
    return { ...piece, kind, remnantOrigin }
  })

  return {
    version: 2 as const,
    exportedAt: legacy.data.exportedAt,
    pieces,
    materials: legacy.data.materials,
    // Recomputed from the migrated codes: the v1 counters were keyed by four kinds and two of
    // those keys no longer exist.
    counters: deriveCounters(pieces),
    photos: legacy.data.photos,
    presets: legacy.data.presets,
  }
}

/**
 * Parse a backup of any supported version into the current shape.
 * Returns `null` when the payload is neither — the caller decides what to tell the user.
 */
export function parseBackup(input: unknown): Backup | null {
  const current = backupSchema.safeParse(input)
  if (current.success) return current.data
  return migrateLegacyBackup(input)
}
