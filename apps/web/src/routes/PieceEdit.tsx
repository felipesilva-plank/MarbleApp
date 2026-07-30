import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import type { CreatePieceInput } from '@marble/core'
import { errorMessage } from '../data'
import { useKnownLocations, usePiece, usePieces, useUpdatePiece } from '../hooks/usePieces'
import { useMaterials } from '../hooks/useMaterials'
import { PieceForm } from '../components/PieceForm'
import { EmptyState, Loading, PageHeader } from '../components/ui'

export function PieceEdit() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const { data: piece, isLoading } = usePiece(id)
  const { data: allPieces } = usePieces()
  const { data: materials } = useMaterials()
  const { data: locations } = useKnownLocations()
  const updatePiece = useUpdatePiece()

  if (isLoading) return <Loading />
  if (!piece) {
    return <EmptyState title="Piece not found" description="It may have been deleted." />
  }

  const defaultValues: CreatePieceInput = {
    kind: piece.kind,
    status: piece.status,
    parentId: piece.parentId,
    materialId: piece.materialId,
    lengthMm: piece.lengthMm,
    widthMm: piece.widthMm,
    thicknessMm: piece.thicknessMm,
    location: piece.location,
    notes: piece.notes,
  }

  // Arrow const, not a declaration: declarations hoist above the `if (!piece)` guard and lose
  // the narrowing.
  const handleSubmit = async (values: CreatePieceInput) => {
    setError(null)
    try {
      // parentId is intentionally not part of this payload — lineage changes go through
      // assignParent on the detail page, which checks for cycles and recomputes the subtree.
      await updatePiece.mutateAsync({ id: piece.id, input: values })
      navigate(`/pieces/${piece.id}`)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={`Edit ${piece.code}`}
        subtitle="Change the details of this piece. Its source is managed from the piece page."
      />

      <PieceForm
        mode="edit"
        defaultValues={defaultValues}
        allPieces={allPieces ?? []}
        materials={materials ?? []}
        locations={locations ?? []}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/pieces/${piece.id}`)}
        submitting={updatePiece.isPending}
        error={error}
        submitLabel="Save changes"
      />
    </div>
  )
}
