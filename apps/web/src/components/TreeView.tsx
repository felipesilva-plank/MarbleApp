import type { TreeNode } from '@marble/core'
import { formatDimensions } from '@marble/core'
import { Link } from 'react-router'
import { KindBadge, StatusBadge } from './badges'
import { PieceThumb } from './PieceThumb'
import { cx } from './ui'

/**
 * Plain recursive DOM with CSS connector lines — no graph library.
 * At the depths real stone lineage reaches (rarely past 4), a nested list is clearer than a
 * canvas, and it reflows on mobile and prints correctly for free.
 */
function Node({ node, currentId }: { node: TreeNode; currentId?: string }) {
  const { piece } = node
  const isCurrent = piece.id === currentId

  return (
    <div className="tree-node">
      <Link
        to={`/pieces/${piece.id}`}
        className={cx(
          'flex items-center gap-3 rounded-lg border px-3 py-2 transition',
          isCurrent
            ? 'border-stone-900 bg-stone-900/5 ring-1 ring-stone-900'
            : 'border-stone-200 bg-white hover:border-stone-300 hover:bg-stone-50',
        )}
      >
        <PieceThumb piece={piece} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-stone-900">{piece.code}</span>
            <KindBadge kind={piece.kind} />
            <StatusBadge status={piece.status} />
            {isCurrent ? (
              <span className="text-xs font-medium text-stone-500">you are here</span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-stone-500">
            {formatDimensions(piece)}
            {piece.location ? ` · ${piece.location}` : ''}
          </p>
        </div>
      </Link>

      {node.children.length > 0 ? (
        <div className="tree-branch mt-2 space-y-2">
          {node.children.map((child) => (
            <Node key={child.piece.id} node={child} currentId={currentId} />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function TreeView({ tree, currentId }: { tree: TreeNode; currentId?: string }) {
  return <Node node={tree} currentId={currentId} />
}
