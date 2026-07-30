import { getAncestors } from '@marble/core'
import type { Piece } from '@marble/core'
import { Link } from 'react-router'
import { KindBadge } from './badges'

/**
 * The answer to "where did this come from?" — the whole reason the app exists.
 * Ordered root-first, so it reads the way the stone actually travelled.
 */
export function ProvenanceBreadcrumb({ piece, pieces }: { piece: Piece; pieces: Piece[] }) {
  const ancestors = getAncestors(pieces, piece.id)

  if (ancestors.length === 0) {
    return (
      <p className="text-sm text-stone-500">
        No source recorded — the trail starts here.{' '}
        <span className="text-stone-400">
          If you know which piece this was cut from, link it below.
        </span>
      </p>
    )
  }

  return (
    <nav aria-label="Provenance" className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm">
      {ancestors.map((ancestor) => (
        <span key={ancestor.id} className="flex items-center gap-1.5">
          <Link
            to={`/pieces/${ancestor.id}`}
            className="rounded font-medium text-stone-700 underline decoration-stone-300 underline-offset-2 hover:text-stone-900 hover:decoration-stone-500"
          >
            {ancestor.code}
          </Link>
          <KindBadge kind={ancestor.kind} />
          <span className="px-0.5 text-stone-400">›</span>
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="font-semibold text-stone-900">{piece.code}</span>
        <KindBadge kind={piece.kind} />
      </span>
    </nav>
  )
}
