/**
 * Domain entities. Framework-free on purpose: this package is imported by the React app and by
 * the API server alike, so nothing here may touch the DOM, React, or Node APIs.
 */

/**
 * The two things a fabricator actually handles.
 *
 * There is deliberately no `block` and no `finished piece`. A shop buys **slabs**, not blocks —
 * the quarry-to-block-to-slab chain happens upstream and never enters this inventory. And a
 * finished piece is fabricated for one project and delivered straight to the customer's house,
 * so it never sits on a rack to be tracked. What is left on the floor at the end of a cut is a
 * **remnant**, and that is the only other kind there is.
 */
export type PieceKind = 'slab' | 'remnant'

/**
 * How a remnant came to exist. Both routes end with stone on the rack that can still be cut.
 *
 * - `offcut` — the normal case: what is left of a slab after a job was cut out of it. A good day
 *   is ~6 slabs cut, each leaving 2–3 offcuts.
 * - `rejected` — a finished piece that came back. Wrong measurement, bad edge, damage in
 *   transit; a replacement was fabricated and the returned piece is resold as long as another
 *   job can still be cut from it. This is the only way a finished piece ever enters the system.
 */
export type RemnantOrigin = 'offcut' | 'rejected'

export type PieceStatus =
  | 'available'
  | 'reserved'
  | 'partially_used'
  | 'consumed'
  | 'scrapped'

export const PIECE_KINDS: readonly PieceKind[] = ['slab', 'remnant']

export const REMNANT_ORIGINS: readonly RemnantOrigin[] = ['offcut', 'rejected']

export const PIECE_STATUSES: readonly PieceStatus[] = [
  'available',
  'reserved',
  'partially_used',
  'consumed',
  'scrapped',
]

export const PIECE_KIND_LABELS: Record<PieceKind, string> = {
  slab: 'Slab',
  remnant: 'Remnant',
}

export const REMNANT_ORIGIN_LABELS: Record<RemnantOrigin, string> = {
  offcut: 'Cut offcut',
  rejected: 'Returned piece',
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
 * A slab is bought from a supplier, so having no parent is normal for one. A remnant with no
 * parent is the exact problem this app exists to fix — stone on the rack whose origin was never
 * written down.
 */
export const DERIVED_KINDS: readonly PieceKind[] = ['remnant']

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
  /** null = bought from a supplier, or origin genuinely unknown. */
  parentId: string | null
  /** Topmost ancestor's id. Equals `id` when parentId is null. Derived — see tree.ts. */
  rootId: string
  /** 0 at the root. Derived — see tree.ts. */
  depth: number

  kind: PieceKind
  /** Set for every remnant, always null for a slab. See `RemnantOrigin`. */
  remnantOrigin: RemnantOrigin | null
  /** Always user-controlled. Registering a child never mutates the parent's status. */
  status: PieceStatus
  materialId: string | null

  // Integer millimetres throughout. Industry convention: 3200 x 1900 x 20 mm.
  lengthMm: number
  widthMm: number
  thicknessMm: number

  location: string
  /** The blob itself lives in object storage; the record only knows whether one exists. */
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

/** A fabrication shop. Every record in the system belongs to exactly one. */
export interface Org {
  id: string
  name: string
  createdAt: string
}

export type OrgRole = 'owner' | 'member'

export const ORG_ROLES: readonly OrgRole[] = ['owner', 'member']

/**
 * What the API hands back about the signed-in person. Note what is absent: no password hash and
 * no salt. Credentials never leave the server, so they are not part of the shared entity.
 */
export interface User {
  id: string
  orgId: string
  email: string
  name: string
  role: OrgRole
  createdAt: string
}

export type Counters = Record<PieceKind, number>

export interface TreeNode {
  piece: Piece
  children: TreeNode[]
}

export interface PieceFilter {
  q?: string
  kind?: PieceKind | null
  remnantOrigin?: RemnantOrigin | null
  status?: PieceStatus | null
  materialId?: string | null
  location?: string | null
  rootId?: string | null
  parentId?: string | null
  /** Only pieces at least this large — the way you actually shop for a remnant. */
  minLengthMm?: number | null
  minWidthMm?: number | null
  thicknessMm?: number | null
  /** true = only remnants with no recorded source. See `isUnlinked`. */
  orphansOnly?: boolean
}
