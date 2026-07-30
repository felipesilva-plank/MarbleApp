import { PIECE_KIND_LABELS, PIECE_STATUS_LABELS } from '@marble/core'
import type { PieceKind, PieceStatus } from '@marble/core'
import { cx } from './ui'

const BASE = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium'

const KIND_STYLES: Record<PieceKind, string> = {
  block: 'bg-stone-800 text-white',
  slab: 'bg-indigo-100 text-indigo-800',
  remnant: 'bg-teal-100 text-teal-800',
  finished: 'bg-violet-100 text-violet-800',
}

const STATUS_STYLES: Record<PieceStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800',
  reserved: 'bg-amber-100 text-amber-800',
  partially_used: 'bg-sky-100 text-sky-800',
  consumed: 'bg-stone-200 text-stone-600',
  scrapped: 'bg-rose-100 text-rose-800',
}

export function KindBadge({ kind, className }: { kind: PieceKind; className?: string }) {
  return <span className={cx(BASE, KIND_STYLES[kind], className)}>{PIECE_KIND_LABELS[kind]}</span>
}

export function StatusBadge({ status, className }: { status: PieceStatus; className?: string }) {
  return (
    <span className={cx(BASE, STATUS_STYLES[status], className)}>
      {PIECE_STATUS_LABELS[status]}
    </span>
  )
}

/** Marks a piece whose origin was never recorded — the backlog this app exists to clear. */
export function OrphanBadge({ className }: { className?: string }) {
  return (
    <span
      className={cx(BASE, 'border border-dashed border-amber-400 bg-amber-50 text-amber-800', className)}
      title="No source piece recorded"
    >
      Unlinked
    </span>
  )
}
