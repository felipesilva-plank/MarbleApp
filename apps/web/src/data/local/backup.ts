import { backupSchema, deriveCounters } from '@marble/core'
import type { FilterPreset, Material, Piece } from '@marble/core'
import { DomainError } from '../errors'
import type { BackupPort } from '../ports'
import { KEYS, readJson, writeJson } from './db'
import { writeMaterials } from './materialRepo'
import * as photos from './photos'
import { readCounters, readPieces, writePieces } from './pieceRepo'
import { readPresets, writePresets } from './presetRepo'

/**
 * Browser-local data with no backup is data you will lose. This is the escape hatch — and it
 * doubles as the migration path: the export seeds the first Postgres database, so nothing is
 * stranded when the backend lands.
 */
export const localBackupPort: BackupPort = {
  async exportAll(): Promise<string> {
    const payload = {
      version: 1 as const,
      exportedAt: new Date().toISOString(),
      pieces: readPieces(),
      materials: readJson<Material[]>(KEYS.materials, []),
      counters: readCounters(),
      presets: readPresets(),
      photos: await photos.allPhotos(),
    }
    return JSON.stringify(payload, null, 2)
  },

  async importAll(json: string): Promise<{ pieces: number; materials: number }> {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new DomainError('BAD_BACKUP', 'That file is not valid JSON.')
    }

    const result = backupSchema.safeParse(parsed)
    if (!result.success) {
      const first = result.error.issues[0]
      const where = first?.path.join('.') || 'the file'
      throw new DomainError(
        'BAD_BACKUP',
        `That backup does not look right (${where}: ${first?.message ?? 'unexpected shape'}).`,
      )
    }

    const backup = result.data
    const pieces = backup.pieces as Piece[]

    writePieces(pieces)
    writeMaterials(backup.materials as Material[])
    // Recompute rather than trusting the file: a hand-edited or older export could otherwise
    // hand us counters that generate codes colliding with pieces it also contains.
    writeJson(KEYS.counters, deriveCounters(pieces))
    // Absent in any backup written before saved presets existed - restoring one should clear
    // presets rather than leave the previous inventory's filters pointing at gone materials.
    writePresets((backup.presets ?? []) as FilterPreset[])
    await photos.replaceAllPhotos(backup.photos ?? {})

    return { pieces: pieces.length, materials: backup.materials.length }
  },
}
