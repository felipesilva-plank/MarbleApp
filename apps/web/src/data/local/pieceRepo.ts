import {
  applyFilter,
  emptyCounters,
  getChildren,
  nextCode,
  recomputeSubtree,
  wouldCreateCycle,
} from '@marble/core'
import type { Counters, CreatePieceInput, Piece, PieceFilter, UpdatePieceInput } from '@marble/core'
import { DomainError } from '../errors'
import type { PieceRepository } from '../ports'
import { KEYS, ORG_ID, newId, nowIso, readJson, writeJson } from './db'
import * as photos from './photos'
import { requireUserId } from './session'

export function readPieces(): Piece[] {
  return readJson<Piece[]>(KEYS.pieces, [])
}

export function writePieces(pieces: Piece[]): void {
  writeJson(KEYS.pieces, pieces)
}

export function readCounters(): Counters {
  return readJson<Counters>(KEYS.counters, emptyCounters())
}

function mergeUpdated(pieces: Piece[], updated: Piece[]): Piece[] {
  const byId = new Map(updated.map((p) => [p.id, p]))
  return pieces.map((p) => byId.get(p.id) ?? p)
}

function requirePiece(pieces: Piece[], id: string, label = 'piece'): Piece {
  const found = pieces.find((p) => p.id === id)
  if (!found) throw new DomainError('NOT_FOUND', `That ${label} no longer exists.`)
  return found
}

export const localPieceRepository: PieceRepository = {
  async list(filter?: PieceFilter): Promise<Piece[]> {
    return applyFilter(readPieces(), filter).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  },

  async get(id: string): Promise<Piece | null> {
    return readPieces().find((p) => p.id === id) ?? null
  },

  async create(input: CreatePieceInput): Promise<Piece> {
    const createdBy = requireUserId()
    const pieces = readPieces()
    const parent = input.parentId ? requirePiece(pieces, input.parentId, 'parent piece') : null

    const { code, counters } = nextCode(input.kind, readCounters())
    const id = newId()
    const timestamp = nowIso()

    const piece: Piece = {
      id,
      orgId: ORG_ID,
      code,
      parentId: parent?.id ?? null,
      rootId: parent ? parent.rootId : id,
      depth: parent ? parent.depth + 1 : 0,
      kind: input.kind,
      status: input.status,
      materialId: input.materialId,
      lengthMm: input.lengthMm,
      widthMm: input.widthMm,
      thicknessMm: input.thicknessMm,
      location: input.location.trim(),
      hasPhoto: false,
      notes: input.notes.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy,
    }

    // Save the pieces first: if this throws on quota, the counter must not have advanced,
    // otherwise the next successful create would skip a code.
    writePieces([...pieces, piece])
    writeJson(KEYS.counters, counters)

    return piece
  },

  async update(id: string, input: UpdatePieceInput): Promise<Piece> {
    const pieces = readPieces()
    const existing = requirePiece(pieces, id)

    // parentId is deliberately dropped here. Changing lineage has to go through assignParent,
    // which checks for cycles and recomputes rootId/depth for the whole subtree.
    const { parentId: _ignored, ...patch } = input

    const updated: Piece = {
      ...existing,
      ...patch,
      location: (patch.location ?? existing.location).trim(),
      notes: (patch.notes ?? existing.notes).trim(),
      updatedAt: nowIso(),
    }

    writePieces(pieces.map((p) => (p.id === id ? updated : p)))
    return updated
  },

  async assignParent(id: string, parentId: string | null): Promise<Piece[]> {
    const pieces = readPieces()
    const target = requirePiece(pieces, id)

    if (parentId !== null) {
      const parent = requirePiece(pieces, parentId, 'parent piece')
      if (wouldCreateCycle(pieces, id, parentId)) {
        throw new DomainError(
          'CYCLE',
          parentId === id
            ? `${target.code} cannot be cut from itself.`
            : `${parent.code} was already cut from ${target.code}, so it cannot also be its source.`,
        )
      }
    }

    const withNewParent = pieces.map((p) =>
      p.id === id ? { ...p, parentId, updatedAt: nowIso() } : p,
    )
    const recomputed = recomputeSubtree(withNewParent, id)

    writePieces(mergeUpdated(withNewParent, recomputed))
    return recomputed
  },

  async remove(id: string, opts: { orphanChildren?: boolean } = {}): Promise<void> {
    const pieces = readPieces()
    const target = requirePiece(pieces, id)
    const children = getChildren(pieces, id)

    if (children.length > 0 && !opts.orphanChildren) {
      throw new DomainError(
        'HAS_CHILDREN',
        `${target.code} has ${children.length} piece${children.length === 1 ? '' : 's'} cut from it. ` +
          'Deleting it would erase their origin.',
      )
    }

    let remaining = pieces.filter((p) => p.id !== id)

    if (children.length > 0) {
      const timestamp = nowIso()
      remaining = remaining.map((p) =>
        p.parentId === id ? { ...p, parentId: null, updatedAt: timestamp } : p,
      )
      // Each detached child becomes its own root; its descendants need new rootId/depth too.
      for (const child of children) {
        remaining = mergeUpdated(remaining, recomputeSubtree(remaining, child.id))
      }
    }

    writePieces(remaining)
    await photos.deletePhoto(id)
  },

  async setPhoto(id: string, dataUrl: string | null): Promise<void> {
    const pieces = readPieces()
    requirePiece(pieces, id)

    if (dataUrl) await photos.putPhoto(id, dataUrl)
    else await photos.deletePhoto(id)

    writePieces(
      pieces.map((p) =>
        p.id === id ? { ...p, hasPhoto: dataUrl !== null, updatedAt: nowIso() } : p,
      ),
    )
  },

  async getPhotoUrl(id: string): Promise<string | null> {
    return photos.getPhoto(id)
  },

  async knownLocations(): Promise<string[]> {
    const seen = new Set<string>()
    for (const piece of readPieces()) {
      const location = piece.location.trim()
      if (location) seen.add(location)
    }
    return [...seen].sort((a, b) => a.localeCompare(b))
  },
}
