/**
 * Domain entities. Framework-free on purpose: this package is imported by the React app today
 * and by the Fastify API later, so nothing here may touch the DOM, React, or Node APIs.
 */

export type PieceKind = 'block' | 'slab' | 'remnant' | 'finished'

export type PieceStatus =
  | 'available'
  | 'reserved'
  | 'partially_used'
  | 'consumed'
  | 'scrapped'

export const PIECE_KINDS: readonly PieceKind[] = ['block', 'slab', 'remnant', 'finished']

export const PIECE_STATUSES: readonly PieceStatus[] = [
  'available',
  'reserved',
  'partially_used',
  'consumed',
  'scrapped',
]

export const PIECE_KIND_LABELS: Record<PieceKind, string> = {
  block: 'Block',
  slab: 'Slab',
  remnant: 'Remnant',
  finished: 'Finished piece',
}

export const PIECE_STATUS_LABELS: Record<PieceStatus, string> = {
  available: 'Available',
  reserved: 'Reserved',
  partially_used: 'Partially used',
  consumed: 'Consumed',
  scrapped: 'Scrapped',
}

/** Statuses that mean the piece is still physically on the rack and usable. */
export const IN_STOCK_STATUSES: readonly PieceStatus[] = ['available', 'reserved', 'partially_used']

/**
 * Kinds that, by definition, were cut from something else.
 *
 * A block arrives from a quarry and a slab may be bought finished, so having no parent is normal
 * for those. A remnant with no parent is the exact problem this app exists to fix — it is stone
 * on the rack whose origin was never written down.
 */
export const DERIVED_KINDS: readonly PieceKind[] = ['remnant', 'finished']

/**
 * One row is one physical piece of stone. There is deliberately no `quantity` field:
 * two identical remnants are two records, because they have different lineage and location.
 */
export interface Piece {
  id: string
  orgId: string
  /** Human-readable, unique per org. e.g. 'SLB-0042' */
  code: string

  // --- lineage ---
  /** null = arrived from outside (quarry/supplier), or origin genuinely unknown. */
  parentId: string | null
  /** Topmost ancestor's id. Equals `id` when parentId is null. Derived — see tree.ts. */
  rootId: string
  /** 0 at the root. Derived — see tree.ts. */
  depth: number

  kind: PieceKind
  /** Always user-controlled. Registering a child never mutates the parent's status. */
  status: PieceStatus
  materialId: string | null

  // Integer millimetres throughout. Industry convention: 3200 x 1900 x 20 mm.
  lengthMm: number
  widthMm: number
  thicknessMm: number

  location: string
  /** The blob itself lives outside the record (IndexedDB now, object storage later). */
  hasPhoto: boolean
  notes: string

  createdAt: string
  updatedAt: string
  createdBy: string
}

export interface Material {
  id: string
  orgId: string
  name: string
  color: string
  finish: string
  notes: string
  createdAt: string
}

export interface User {
  id: string
  orgId: string
  email: string
  name: string
  /** PBKDF2-SHA256. See the security note in the web app's authRepo. */
  passwordHash: string
  passwordSalt: string
  createdAt: string
}

export interface Session {
  userId: string
  expiresAt: string
}

export type Counters = Record<PieceKind, number>

export interface TreeNode {
  piece: Piece
  children: TreeNode[]
}

export interface PieceFilter {
  q?: string
  kind?: PieceKind | null
  status?: PieceStatus | null
  materialId?: string | null
  location?: string | null
  rootId?: string | null
  parentId?: string | null
  /** Only pieces at least this large — the way you actually shop for a remnant. */
  minLengthMm?: number | null
  minWidthMm?: number | null
  thicknessMm?: number | null
  /** true = only remnants/finished pieces with no recorded source. See `isUnlinked`. */
  orphansOnly?: boolean
}
