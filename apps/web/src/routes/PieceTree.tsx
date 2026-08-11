import { Link, useParams } from 'react-router'
import { buildTreeFrom, getDescendants } from '@marble/core'
import { usePiece, usePieces } from '../hooks/usePieces'
import { TreeView } from '../components/TreeView'
import { Button, Card, EmptyState, Loading, PageHeader } from '../components/ui'

export function PieceTree() {
  const { id } = useParams<{ id: string }>()
  const { data: piece, isLoading } = usePiece(id)
  const { data: allPieces } = usePieces()

  if (isLoading) return <Loading />
  if (!piece) {
    return (
      <EmptyState
        title="Piece not found"
        description="It may have been deleted."
        action={
          <Link to="/pieces">
            <Button variant="primary">Back to pieces</Button>
          </Link>
        }
      />
    )
  }

  const pieces = allPieces ?? []
  // Render from the very top of the lineage, not from this piece, so the whole history is visible.
  const tree = buildTreeFrom(pieces, piece.rootId)
  const total = tree ? getDescendants(pieces, piece.rootId).length + 1 : 0

  return (
    <div>
      <PageHeader
        title="Family tree"
        subtitle={
          piece.rootId === piece.id
            ? `${piece.code} and everything cut from it — ${total} piece${total === 1 ? '' : 's'} in total.`
            : `The full lineage containing ${piece.code} — ${total} piece${total === 1 ? '' : 's'} in total.`
        }
        actions={
          <Link to={`/pieces/${piece.id}`}>
            <Button>Back to {piece.code}</Button>
          </Link>
        }
      />

      <Card className="p-5">
        {tree ? (
          <TreeView tree={tree} currentId={piece.id} />
        ) : (
          <p className="text-sm text-stone-500">This lineage could not be rebuilt.</p>
        )}
      </Card>
    </div>
  )
}
