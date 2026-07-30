import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { suggestChildKind } from '@marble/core'
import type { CreatePieceInput } from '@marble/core'
import { errorMessage } from '../data'
import { useCreatePiece, useKnownLocations, usePieces } from '../hooks/usePieces'
import { useMaterials } from '../hooks/useMaterials'
import { PieceForm } from '../components/PieceForm'
import { Alert, Loading, PageHeader } from '../components/ui'

export function PieceNew() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const { data: allPieces, isLoading } = usePieces()
  const { data: materials } = useMaterials()
  const { data: locations } = useKnownLocations()
  const createPiece = useCreatePiece()

  if (isLoading) return <Loading />

  const pieces = allPieces ?? []
  const requestedParentId = params.get('parentId')
  const parent = pieces.find((p) => p.id === requestedParentId) ?? null

  // A piece cut from a parent inherits its material, thickness and shelf by default — it is
  // literally the same stone. The user can still change any of it.
  const defaultValues: CreatePieceInput = {
    kind: parent ? suggestChildKind(parent.kind) : 'slab',
    status: 'available',
    parentId: parent?.id ?? null,
    materialId: parent?.materialId ?? null,
    lengthMm: '' as unknown as number,
    widthMm: '' as unknown as number,
    thicknessMm: parent?.thicknessMm ?? ('' as unknown as number),
    location: parent?.location ?? '',
    notes: '',
  }

  async function handleSubmit(values: CreatePieceInput) {
    setError(null)
    try {
      const created = await createPiece.mutateAsync(values)
      navigate(`/pieces/${created.id}`, { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={parent ? `Cut a piece from ${parent.code}` : 'Add a piece'}
        subtitle={
          parent
            ? 'The new piece will permanently record where it came from.'
            : 'Register stone that arrived from a supplier or quarry, or a piece whose origin you will link later.'
        }
      />

      {requestedParentId && !parent ? (
        <div className="mb-6">
          <Alert tone="warning">
            The source piece in this link no longer exists. You can still save this piece and{' '}
            <Link to="/pieces" className="underline underline-offset-2">
              link it to a source
            </Link>{' '}
            afterwards.
          </Alert>
        </div>
      ) : null}

      <PieceForm
        mode="create"
        defaultValues={defaultValues}
        allPieces={pieces}
        materials={materials ?? []}
        locations={locations ?? []}
        excludeIds={new Set()}
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
        submitting={createPiece.isPending}
        error={error}
        submitLabel="Save piece"
      />
    </div>
  )
}
