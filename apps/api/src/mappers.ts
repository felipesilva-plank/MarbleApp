import type { Material, Piece, User } from '@marble/core'
import type {
  Material as MaterialRow,
  Piece as PieceRow,
  User as UserRow,
  FilterPreset as PresetRow,
} from '@prisma/client'
import type { FilterPreset } from '@marble/core'

/**
 * Rows in, domain entities out.
 *
 * Two things happen here and nowhere else. Dates become ISO strings, because `Piece.createdAt` is
 * a `string` in the shared type and JSON has no date anyway. And credentials are dropped: a
 * `UserRow` carries `passwordHash`, the `User` entity does not, so an endpoint cannot leak one by
 * forgetting which fields to select.
 */

export function toPiece(row: PieceRow): Piece {
  return {
    id: row.id,
    orgId: row.orgId,
    code: row.code,
    parentId: row.parentId,
    rootId: row.rootId,
    depth: row.depth,
    kind: row.kind,
    remnantOrigin: row.remnantOrigin,
    status: row.status,
    materialId: row.materialId,
    lengthMm: row.lengthMm,
    widthMm: row.widthMm,
    thicknessMm: row.thicknessMm,
    location: row.location,
    hasPhoto: row.hasPhoto,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdById,
  }
}

export function toMaterial(row: MaterialRow): Material {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    color: row.color,
    finish: row.finish,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    orgId: row.orgId,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toPreset(row: PresetRow): FilterPreset {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    slug: row.slug,
    query: row.query,
    createdAt: row.createdAt.toISOString(),
  }
}
