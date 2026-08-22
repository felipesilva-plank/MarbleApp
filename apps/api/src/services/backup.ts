import { DomainError, deriveCounters, parseBackup } from '@marble/core'
import type { Backup } from '@marble/core'
import { db } from '../db.ts'
import { photoStore } from '../photos/store.ts'

/**
 * Import and export of an org's whole inventory.
 *
 * This is not a nice-to-have. The browser-only MVP's export is the only copy of the data it
 * collected, and importing one here is how a shop that trialled it arrives with its stone intact
 * — which is why `parseBackup` accepts the retired four-kind format as well as the current one.
 * It is also the answer to "can we leave?", and a product that cannot answer that does not
 * deserve a subscription.
 */

const DATA_URL = /^data:([^;,]+)(;base64)?,(.*)$/s

function decodeDataUrl(value: string): { bytes: Uint8Array; contentType: string } | null {
  const match = DATA_URL.exec(value)
  if (!match) return null
  const [, contentType, isBase64, payload] = match
  const bytes = isBase64
    ? new Uint8Array(Buffer.from(payload, 'base64'))
    : new TextEncoder().encode(decodeURIComponent(payload))
  return { bytes, contentType }
}

function toDataUrl(bytes: Uint8Array, contentType: string): string {
  return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`
}

export async function exportAll(orgId: string): Promise<Backup> {
  const [pieceRows, materialRows, counterRows] = await Promise.all([
    db().piece.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } }),
    db().material.findMany({ where: { orgId }, orderBy: { name: 'asc' } }),
    db().codeCounter.findMany({ where: { orgId } }),
  ])

  const photos: Record<string, string> = {}
  for (const row of pieceRows) {
    if (!row.hasPhoto) continue
    const stored = await photoStore().get(orgId, row.id)
    if (stored) photos[row.id] = toDataUrl(stored.bytes, stored.contentType)
  }

  const counters = { slab: 0, remnant: 0 }
  for (const row of counterRows) counters[row.kind] = row.value

  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    pieces: pieceRows.map((row) => ({
      ...row,
      createdBy: row.createdById,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    materials: materialRows.map((row) => ({
      id: row.id,
      orgId: row.orgId,
      name: row.name,
      color: row.color,
      finish: row.finish,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    })),
    counters,
    photos,
  }
}

/**
 * Replaces everything this org has. Destructive by design — a merge would need a conflict rule
 * for two pieces with the same code, and there is no answer to that a user could predict.
 */
export async function importAll(
  orgId: string,
  userId: string,
  raw: unknown,
): Promise<{ pieces: number; materials: number }> {
  const backup = parseBackup(raw)
  if (!backup) {
    throw new DomainError(
      'BAD_BACKUP',
      'That file is not a MarbleApp export, or it is from a version this server cannot read.',
    )
  }

  // Ids are rewritten onto this org, so a file exported from one shop cannot overwrite another's
  // rows by id collision, and re-importing the same file twice is not a partial merge.
  const materialIds = new Map<string, string>()
  const pieceIds = new Map<string, string>()
  for (const material of backup.materials) materialIds.set(material.id, crypto.randomUUID())
  for (const piece of backup.pieces) pieceIds.set(piece.id, crypto.randomUUID())

  await db().$transaction(async (tx) => {
    // Children first: `onDelete: Restrict` on the lineage relation means a parent cannot go while
    // anything still points at it.
    await tx.piece.updateMany({ where: { orgId }, data: { parentId: null } })
    await tx.piece.deleteMany({ where: { orgId } })
    await tx.material.deleteMany({ where: { orgId } })

    if (backup.materials.length > 0) {
      await tx.material.createMany({
        data: backup.materials.map((material) => ({
          id: materialIds.get(material.id),
          orgId,
          name: material.name,
          nameFolded: material.name.trim().toLowerCase(),
          color: material.color,
          finish: material.finish,
          notes: material.notes,
          createdAt: new Date(material.createdAt),
        })),
      })
    }

    // Shallowest first, so a parent row always exists before the row referencing it.
    const ordered = [...backup.pieces].sort((a, b) => a.depth - b.depth)
    for (const piece of ordered) {
      await tx.piece.create({
        data: {
          id: pieceIds.get(piece.id),
          orgId,
          code: piece.code,
          parentId: piece.parentId ? (pieceIds.get(piece.parentId) ?? null) : null,
          rootId: pieceIds.get(piece.rootId) ?? (pieceIds.get(piece.id) as string),
          depth: piece.depth,
          kind: piece.kind,
          remnantOrigin: piece.remnantOrigin,
          status: piece.status,
          materialId: piece.materialId ? (materialIds.get(piece.materialId) ?? null) : null,
          lengthMm: piece.lengthMm,
          widthMm: piece.widthMm,
          thicknessMm: piece.thicknessMm,
          location: piece.location,
          hasPhoto: false,
          notes: piece.notes,
          createdAt: new Date(piece.createdAt),
          updatedAt: new Date(piece.updatedAt),
          // The person doing the import owns the rows: the ids in the file name users of another
          // installation, and a foreign key has to point at somebody who exists here.
          createdById: userId,
        },
      })
    }

    // Recomputed rather than trusted: a hand-edited or older export could otherwise hand us
    // counters that generate codes colliding with pieces it also contains.
    const counters = deriveCounters(backup.pieces)
    for (const kind of ['slab', 'remnant'] as const) {
      await tx.codeCounter.upsert({
        where: { orgId_kind: { orgId, kind } },
        create: { orgId, kind, value: counters[kind] },
        update: { value: counters[kind] },
      })
    }
  })

  // Photos after the transaction: object storage is not transactional, and a blob write failing
  // must not roll back an inventory that imported cleanly.
  for (const [oldId, dataUrl] of Object.entries(backup.photos ?? {})) {
    const newId = pieceIds.get(oldId)
    const decoded = newId ? decodeDataUrl(dataUrl) : null
    if (!newId || !decoded) continue
    await photoStore().put(orgId, newId, decoded.bytes, decoded.contentType)
    await db().piece.update({ where: { id: newId }, data: { hasPhoto: true } })
  }

  return { pieces: backup.pieces.length, materials: backup.materials.length }
}
