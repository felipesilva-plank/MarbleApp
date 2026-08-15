import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { suggestChildKind } from '@marble/core'
import type { CreatePieceInput } from '@marble/core'
import { errorMessage } from '../data'
import { useCreatePiece, useKnownLocations, usePieces, useSetPhoto } from '../hooks/usePieces'
import { useMaterials } from '../hooks/useMaterials'
import { PieceForm } from '../components/PieceForm'
import { Alert, Loading, PageHeader } from '../components/ui'

export function PieceNew() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  // Held here until the piece exists — a photo needs an id to be stored against.
  const [photo, setPhoto] = useState<string | null>(null)

  const { data: allPieces, isLoading } = usePieces()
  const { data: materials } = useMaterials()
  const { data: locations } = useKnownLocations()
  const createPiece = useCreatePiece()
  const setPiecePhoto = useSetPhoto()

  if (isLoading) return <Loading />

  const pieces = allPieces ?? []
  const requestedParentId = params.get('parentId')
  const parent = pieces.find((p) => p.id === requestedParentId) ?? null

  // Duplicating copies everything the user typed and nothing the system owns: no id, no code, no
  // photo. The SOURCE's parent is carried over, not the source itself - two slabs sawn from the
  // same block are siblings, and making the copy a child of the original would record a cut that
  // never happened.
  const requestedDuplicateId = params.get('duplicateOf')
  const source = pieces.find((p) => p.id === requestedDuplicateId) ?? null

  const defaultValues: CreatePieceInput = source
    ? {
        kind: source.kind,
        status: source.status,
        parentId: source.parentId,
        materialId: source.materialId,
        lengthMm: source.lengthMm,
        widthMm: source.widthMm,
        thicknessMm: source.thicknessMm,
        location: source.location,
        notes: source.notes,
      }
    : {
        // A piece cut from a parent inherits its material, thickness and shelf by default — it is
        // literally the same stone. The user can still change any of it.
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

    let created
    try {
      created = await createPiece.mutateAsync(values)
    } catch (caught) {
      setError(errorMessage(caught))
      return
    }

    // The piece is saved from here on. If attaching the photo fails (storage quota is the
    // realistic cause) we must still move on — leaving the user on the form would invite a
    // resubmit and a duplicate piece. Carry the reason through so the detail page can explain
    // it and offer a retry.
    if (photo) {
      try {
        await setPiecePhoto.mutateAsync({ id: created.id, dataUrl: photo })
      } catch (caught) {
        navigate(`/pieces/${created.id}`, {
          replace: true,
          state: { photoError: errorMessage(caught) },
        })
        return
      }
    }

    navigate(`/pieces/${created.id}`, { replace: true })
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title={
          source
            ? `Duplicate of ${source.code}`
            : parent
              ? `Cut a piece from ${parent.code}`
              : 'Add a piece'
        }
        subtitle={
          source
            ? 'Everything is copied except the code and the photo. It gets its own code on save.'
            : parent
              ? 'The new piece will permanently record where it came from.'
              : 'Register stone that arrived from a supplier or quarry, or a piece whose origin you will link later.'
        }
      />

      {requestedDuplicateId && !source ? (
        <div className="mb-6">
          <Alert tone="warning">
            The piece you asked to duplicate no longer exists. This form is blank — fill it in, or{' '}
            <Link to="/pieces" className="underline underline-offset-2">
              go back to the list
            </Link>
            .
          </Alert>
        </div>
      ) : null}

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
        photo={photo}
        onPhotoChange={setPhoto}
        onSubmit={handleSubmit}
        onCancel={() => navigate(-1)}
        submitting={createPiece.isPending || setPiecePhoto.isPending}
        error={error}
        submitLabel="Save piece"
      />
    </div>
  )
}
