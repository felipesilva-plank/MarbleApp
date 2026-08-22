import {
  DomainError,
  applyFilter,
  createPieceSchema,
  nextCode,
  recomputeSubtree,
  updatePieceSchema,
  wouldCreateCycle,
} from '@marble/core'
import type {
  Counters,
  CreatePieceInput,
  Piece,
  PieceFilter,
  PieceKind,
  UpdatePieceInput,
} from '@marble/core'
import type { Prisma, PrismaClient } from '@prisma/client'
import { db } from '../db.ts'
import { toPiece } from '../mappers.ts'
import { photoStore } from '../photos/store.ts'

type Tx = Prisma.TransactionClient | PrismaClient

/**
 * Every lineage rule in this file is imported from `@marble/core` rather than reimplemented in
 * SQL. `recomputeSubtree` and `wouldCreateCycle` are the two most heavily tested functions in the
 * codebase and they operate on arrays of `Piece`, so the API loads the org's pieces, runs them,
 * and writes back what changed.
 *
 * That means one full-table read per reparent. At the volumes this serves — a busy shop cuts
 * about six slabs a day and each leaves two or three remnants, so a few thousand rows a year —
 * that is a single indexed scan of a small table, and it buys one implementation of the hardest
 * logic in the product instead of two that must agree. If an org ever outgrows it, the fix is a
 * recursive CTE behind these same two calls, not a rewrite of the callers.
 */
async function orgPieces(tx: Tx, orgId: string): Promise<Piece[]> {
  const rows = await tx.piece.findMany({ where: { orgId } })
  return rows.map(toPiece)
}

async function requirePiece(orgId: string, id: string, label = 'piece'): Promise<Piece> {
  const row = await db().piece.findFirst({ where: { id, orgId } })
  // Deliberately the same answer as "belongs to another shop": a 404 must not confirm that an id
  // exists somewhere else in the system.
  if (!row) throw new DomainError('NOT_FOUND', `That ${label} no longer exists.`)
  return toPiece(row)
}

/**
 * Take the next code for a kind, atomically.
 *
 * `UPDATE ... RETURNING` inside the caller's transaction: two people registering a remnant in the
 * same second get RMN-0008 and RMN-0009, never the same code twice. The MVP's read-modify-write
 * over localStorage could not make that promise.
 */
async function takeCode(tx: Tx, orgId: string, kind: PieceKind): Promise<string> {
  const counter = await tx.codeCounter.upsert({
    where: { orgId_kind: { orgId, kind } },
    create: { orgId, kind, value: 1 },
    update: { value: { increment: 1 } },
  })
  const counters = { slab: 0, remnant: 0, [kind]: counter.value - 1 } as Counters
  return nextCode(kind, counters).code
}

export async function listPieces(orgId: string, filter: PieceFilter = {}): Promise<Piece[]> {
  // Narrow in SQL on the indexed, exactly-comparable columns, then let `matchesFilter` from core
  // apply the rest. The predicate stays the single definition of what a filter means, and the
  // database still does the work that the indexes exist for.
  const where: Prisma.PieceWhereInput = { orgId }
  if (filter.kind) where.kind = filter.kind
  if (filter.remnantOrigin) where.remnantOrigin = filter.remnantOrigin
  if (filter.status) where.status = filter.status
  if (filter.materialId) where.materialId = filter.materialId
  if (filter.rootId) where.rootId = filter.rootId
  if (filter.parentId) where.parentId = filter.parentId

  const rows = await db().piece.findMany({ where, orderBy: { createdAt: 'desc' } })
  return applyFilter(rows.map(toPiece), filter)
}

export async function getPiece(orgId: string, id: string): Promise<Piece | null> {
  const row = await db().piece.findFirst({ where: { id, orgId } })
  return row ? toPiece(row) : null
}

export async function createPiece(
  orgId: string,
  userId: string,
  input: CreatePieceInput,
): Promise<Piece> {
  const parsed = createPieceSchema.parse(input)

  return db().$transaction(async (tx) => {
    const parent = parsed.parentId
      ? await tx.piece.findFirst({ where: { id: parsed.parentId, orgId } })
      : null
    if (parsed.parentId && !parent) {
      throw new DomainError('NOT_FOUND', 'That parent piece no longer exists.')
    }

    const code = await takeCode(tx, orgId, parsed.kind)
    const id = crypto.randomUUID()

    const row = await tx.piece.create({
      data: {
        id,
        orgId,
        code,
        parentId: parent?.id ?? null,
        // A root piece is its own root, which is why the id is generated here rather than left
        // to the database default.
        rootId: parent ? parent.rootId : id,
        depth: parent ? parent.depth + 1 : 0,
        kind: parsed.kind,
        remnantOrigin: parsed.remnantOrigin,
        status: parsed.status,
        materialId: parsed.materialId,
        lengthMm: parsed.lengthMm,
        widthMm: parsed.widthMm,
        thicknessMm: parsed.thicknessMm,
        location: parsed.location.trim(),
        notes: parsed.notes.trim(),
        createdById: userId,
      },
    })
    return toPiece(row)
  })
}

export async function updatePiece(
  orgId: string,
  id: string,
  input: UpdatePieceInput,
): Promise<Piece> {
  const existing = await requirePiece(orgId, id)
  const parsed = updatePieceSchema.parse(input)

  // parentId is dropped here on purpose. Changing lineage has to go through assignParent, which
  // checks for cycles and recomputes rootId/depth for the whole subtree; letting a PATCH set it
  // would be a silent way to corrupt the forest.
  const { parentId: _ignored, ...patch } = parsed

  // The kind/origin pairing is validated per-field by the schema, but a patch only carries the
  // fields it changes — so check the *resulting* piece, not the patch.
  const kind = patch.kind ?? existing.kind
  const remnantOrigin =
    patch.remnantOrigin !== undefined ? patch.remnantOrigin : existing.remnantOrigin
  if (kind === 'remnant' && !remnantOrigin) {
    throw new DomainError('VALIDATION', 'Say where this remnant came from.')
  }

  const row = await db().piece.update({
    where: { id },
    data: {
      ...patch,
      kind,
      // Promoting a remnant to a slab has to clear the origin, or the row keeps a value the
      // model says cannot exist there.
      remnantOrigin: kind === 'slab' ? null : remnantOrigin,
      location: patch.location?.trim(),
      notes: patch.notes?.trim(),
    },
  })
  return toPiece(row)
}

/** Returns every piece whose rootId/depth changed, not just the one that moved. */
export async function assignParent(
  orgId: string,
  id: string,
  parentId: string | null,
): Promise<Piece[]> {
  const target = await requirePiece(orgId, id)

  return db().$transaction(async (tx) => {
    const pieces = await orgPieces(tx, orgId)

    if (parentId !== null) {
      const parent = pieces.find((p) => p.id === parentId)
      if (!parent) throw new DomainError('NOT_FOUND', 'That parent piece no longer exists.')
      if (wouldCreateCycle(pieces, id, parentId)) {
        throw new DomainError(
          'CYCLE',
          parentId === id
            ? `${target.code} cannot be cut from itself.`
            : `${parent.code} was already cut from ${target.code}, so it cannot also be its source.`,
        )
      }
    }

    const withNewParent = pieces.map((p) => (p.id === id ? { ...p, parentId } : p))
    const recomputed = recomputeSubtree(withNewParent, id)

    await tx.piece.update({ where: { id }, data: { parentId } })
    for (const piece of recomputed) {
      await tx.piece.update({
        where: { id: piece.id },
        data: { rootId: piece.rootId, depth: piece.depth },
      })
    }

    // Re-read so the caller gets the rows as the database now has them, timestamps included.
    const updated = await tx.piece.findMany({ where: { id: { in: recomputed.map((p) => p.id) } } })
    return updated.map(toPiece)
  })
}

export async function removePiece(
  orgId: string,
  id: string,
  opts: { orphanChildren?: boolean } = {},
): Promise<void> {
  const target = await requirePiece(orgId, id)

  await db().$transaction(async (tx) => {
    const children = await tx.piece.findMany({ where: { orgId, parentId: id } })

    if (children.length > 0 && !opts.orphanChildren) {
      throw new DomainError(
        'HAS_CHILDREN',
        `${target.code} has ${children.length} piece${children.length === 1 ? '' : 's'} cut from it. ` +
          'Deleting it would erase their origin.',
      )
    }

    if (children.length > 0) {
      await tx.piece.updateMany({ where: { orgId, parentId: id }, data: { parentId: null } })
      // Each detached child becomes its own root, and its descendants need new rootId/depth too.
      let pieces = (await orgPieces(tx, orgId)).filter((p) => p.id !== id)
      for (const child of children) {
        const recomputed = recomputeSubtree(pieces, child.id)
        const byId = new Map(recomputed.map((p) => [p.id, p]))
        pieces = pieces.map((p) => byId.get(p.id) ?? p)
        for (const piece of recomputed) {
          await tx.piece.update({
            where: { id: piece.id },
            data: { rootId: piece.rootId, depth: piece.depth },
          })
        }
      }
    }

    await tx.piece.delete({ where: { id } })
  })

  // After the transaction: a failed blob delete must not roll back a committed row deletion.
  // The worst case is an orphaned object, which the store can sweep; the reverse would leave a
  // piece nobody can delete.
  await photoStore().remove(orgId, id)
}

export async function setPhoto(
  orgId: string,
  id: string,
  photo: { bytes: Uint8Array; contentType: string } | null,
): Promise<void> {
  await requirePiece(orgId, id)

  if (photo) await photoStore().put(orgId, id, photo.bytes, photo.contentType)
  else await photoStore().remove(orgId, id)

  await db().piece.update({ where: { id }, data: { hasPhoto: photo !== null } })
}

export async function getPhoto(
  orgId: string,
  id: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  await requirePiece(orgId, id)
  return photoStore().get(orgId, id)
}

/** Distinct location strings already in use, for the input's autocomplete. */
export async function knownLocations(orgId: string): Promise<string[]> {
  const rows = await db().piece.findMany({
    where: { orgId, NOT: { location: '' } },
    distinct: ['location'],
    select: { location: true },
    orderBy: { location: 'asc' },
  })
  return rows.map((row) => row.location)
}
