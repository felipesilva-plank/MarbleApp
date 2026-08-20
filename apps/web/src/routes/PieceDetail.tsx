import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import {
  PIECE_STATUSES,
  PIECE_STATUS_LABELS,
  areaM2,
  consumptionSummary,
  formatArea,
  formatDimensions,
  formatPct,
  formatVolume,
  getChildren,
  invalidParentIds,
  isUnlinked,
  volumeM3,
} from '@marble/core'
import { errorMessage } from '../data'
import {
  useAssignParent,
  useDeletePiece,
  usePiece,
  usePieces,
  useUpdatePiece,
} from '../hooks/usePieces'
import { useMaterialMap } from '../hooks/useMaterials'
import { formatDate } from '../lib/format'
import { KindBadge, OrphanBadge, StatusBadge } from '../components/badges'
import { ParentPicker } from '../components/ParentPicker'
import { PhotoInput } from '../components/PhotoInput'
import { PieceThumb } from '../components/PieceThumb'
import { ProvenanceBreadcrumb } from '../components/ProvenanceBreadcrumb'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Loading,
  Modal,
  PageHeader,
  SectionTitle,
  Select,
} from '../components/ui'

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-sm text-stone-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-stone-900">{value}</dd>
    </div>
  )
}

export function PieceDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  // Set when the piece saved but its photo did not — see the create flow in PieceNew.
  const photoError = (location.state as { photoError?: string } | null)?.photoError ?? null

  const { data: piece, isLoading } = usePiece(id)
  const { data: allPieces } = usePieces()
  const materialMap = useMaterialMap()

  const updatePiece = useUpdatePiece()
  const assignParent = useAssignParent()
  const deletePiece = useDeletePiece()

  const [parentModalOpen, setParentModalOpen] = useState(false)
  const [draftParentId, setDraftParentId] = useState<string | null>(null)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pieces = useMemo(() => allPieces ?? [], [allPieces])
  const children = useMemo(
    () => (piece ? getChildren(pieces, piece.id) : []),
    [pieces, piece],
  )
  const summary = useMemo(
    () => (piece ? consumptionSummary(piece, children) : null),
    [piece, children],
  )

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

  const material = piece.materialId ? materialMap.get(piece.materialId) : null

  // Arrow consts rather than function declarations: declarations are hoisted above the
  // `if (!piece) return` guard, so TypeScript cannot carry the narrowing into them.
  const handleStatusChange = async (status: string) => {
    setError(null)
    try {
      await updatePiece.mutateAsync({
        id: piece.id,
        input: { status: status as (typeof PIECE_STATUSES)[number] },
      })
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const handleSaveParent = async () => {
    setError(null)
    try {
      await assignParent.mutateAsync({ id: piece.id, parentId: draftParentId })
      setParentModalOpen(false)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const handleDelete = async (orphanChildren: boolean) => {
    setError(null)
    try {
      await deletePiece.mutateAsync({ id: piece.id, orphanChildren })
      navigate('/pieces', { replace: true })
    } catch (caught) {
      setError(errorMessage(caught))
      setDeleteModalOpen(false)
    }
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {piece.code}
            <KindBadge kind={piece.kind} />
            {isUnlinked(piece) ? <OrphanBadge /> : null}
          </span>
        }
        subtitle={`${formatDimensions(piece)} · ${formatArea(areaM2(piece))}`}
        actions={
          <>
            <Link to={`/pieces/new?parentId=${piece.id}`}>
              <Button variant="primary">Cut a piece from this</Button>
            </Link>
            <Link to={`/pieces/${piece.id}/tree`}>
              <Button>Family tree</Button>
            </Link>
            <Link to={`/pieces/${piece.id}/edit`}>
              <Button>Edit</Button>
            </Link>
            <Link to={`/pieces/new?duplicateOf=${piece.id}`}>
              <Button>Duplicate</Button>
            </Link>
            <Button variant="ghost" onClick={() => setDeleteModalOpen(true)}>
              Delete
            </Button>
          </>
        }
      />

      {error ? (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {photoError ? (
        <div className="mb-6">
          <Alert tone="warning">
            {piece.code} was saved, but its photo could not be attached: {photoError} You can try
            again below.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-1">
          <SectionTitle>Photo</SectionTitle>
          <PhotoInput pieceId={piece.id} hasPhoto={piece.hasPhoto} />
        </Card>

        <Card className="p-5 lg:col-span-2">
          <SectionTitle>Details</SectionTitle>
          <dl className="divide-y divide-stone-100">
            <DetailRow
              label="Status"
              value={
                <Select
                  className="w-auto py-1 text-sm"
                  value={piece.status}
                  disabled={updatePiece.isPending}
                  onChange={(event) => void handleStatusChange(event.target.value)}
                >
                  {PIECE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {PIECE_STATUS_LABELS[status]}
                    </option>
                  ))}
                </Select>
              }
            />
            <DetailRow label="Material" value={material?.name ?? '—'} />
            {material?.finish ? <DetailRow label="Finish" value={material.finish} /> : null}
            <DetailRow label="Dimensions" value={formatDimensions(piece)} />
            <DetailRow label="Surface area" value={formatArea(areaM2(piece))} />
            <DetailRow label="Volume" value={formatVolume(volumeM3(piece))} />
            <DetailRow label="Location" value={piece.location || '—'} />
            <DetailRow label="Added" value={formatDate(piece.createdAt)} />
            {piece.notes ? <DetailRow label="Notes" value={piece.notes} /> : null}
          </dl>
        </Card>
      </div>

      <section className="mt-8">
        <SectionTitle
          action={
            <Button
              size="sm"
              onClick={() => {
                setDraftParentId(piece.parentId)
                setParentModalOpen(true)
              }}
            >
              {piece.parentId ? 'Change source' : 'Link to its source'}
            </Button>
          }
        >
          Where this came from
        </SectionTitle>
        <Card className="p-5">
          <ProvenanceBreadcrumb piece={piece} pieces={pieces} />
        </Card>
      </section>

      <section className="mt-8">
        <SectionTitle
          action={
            children.length > 0 ? (
              <Link
                to={`/pieces/${piece.id}/tree`}
                className="text-sm font-medium text-stone-700 underline underline-offset-2 hover:text-stone-900"
              >
                View full tree
              </Link>
            ) : null
          }
        >
          Cut from this piece
        </SectionTitle>

        {children.length === 0 ? (
          <Card className="p-5">
            <p className="text-sm text-stone-500">
              Nothing has been cut from this piece yet. When you do, record it here so the new
              piece keeps its history.
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {summary ? (
              <div className="border-b border-stone-100 bg-stone-50 px-4 py-3 text-sm">
                <p className="text-stone-700">
                  {children.length} piece{children.length === 1 ? '' : 's'} account for{' '}
                  <span className="font-medium">{formatArea(summary.childrenAreaM2)}</span> of this
                  piece&rsquo;s <span className="font-medium">{formatArea(summary.parentAreaM2)}</span>{' '}
                  <span className="text-stone-500">({formatPct(summary.accountedPct)})</span>
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  {summary.overAccounted
                    ? 'More area than the parent — normal when a block is sawn into slabs, since sawing multiplies surface area. Advisory only.'
                    : 'An estimate that ignores saw loss and offcut shape. It never changes the status — that stays yours to set.'}
                </p>
              </div>
            ) : null}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="border-b border-stone-200 text-left text-xs tracking-wide text-stone-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 font-medium">Piece</th>
                    <th className="px-4 py-3 font-medium">Dimensions</th>
                    <th className="px-4 py-3 font-medium">Area</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {children.map((child) => (
                    <tr key={child.id} className="transition hover:bg-stone-50">
                      <td className="px-4 py-3">
                        <Link to={`/pieces/${child.id}`} className="flex items-center gap-3">
                          <PieceThumb piece={child} size="sm" />
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-stone-900">{child.code}</span>
                            <KindBadge kind={child.kind} />
                          </span>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-stone-600">{formatDimensions(child)}</td>
                      <td className="px-4 py-3 text-stone-600">{formatArea(areaM2(child))}</td>
                      <td className="px-4 py-3 text-stone-600">{child.location || '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={child.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      <Modal
        open={parentModalOpen}
        onClose={() => setParentModalOpen(false)}
        title={`Where was ${piece.code} cut from?`}
        footer={
          <>
            <Button onClick={() => setParentModalOpen(false)} disabled={assignParent.isPending}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleSaveParent()}
              disabled={assignParent.isPending}
            >
              Save source
            </Button>
          </>
        }
      >
        <p className="mb-3 text-stone-600">
          Pieces already cut from {piece.code} are hidden — a piece cannot come from its own
          offcut.
        </p>
        <ParentPicker
          pieces={pieces}
          excludeIds={invalidParentIds(pieces, piece.id)}
          value={draftParentId}
          onChange={setDraftParentId}
        />
      </Modal>

      <Modal
        open={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title={`Delete ${piece.code}?`}
        footer={
          <>
            <Button onClick={() => setDeleteModalOpen(false)} disabled={deletePiece.isPending}>
              Cancel
            </Button>
            {children.length > 0 ? (
              <Button
                variant="danger"
                onClick={() => void handleDelete(true)}
                disabled={deletePiece.isPending}
              >
                Delete and unlink {children.length} piece{children.length === 1 ? '' : 's'}
              </Button>
            ) : (
              <Button
                variant="danger"
                onClick={() => void handleDelete(false)}
                disabled={deletePiece.isPending}
              >
                Delete
              </Button>
            )}
          </>
        }
      >
        {children.length > 0 ? (
          <p>
            {children.length} piece{children.length === 1 ? ' was' : 's were'} cut from{' '}
            {piece.code}. Deleting it erases their origin — they will be left with no recorded
            source, which is exactly the problem this app exists to fix. Consider marking it{' '}
            <span className="font-medium">consumed</span> instead.
          </p>
        ) : (
          <p>This cannot be undone. Any photo attached to this piece is deleted too.</p>
        )}
      </Modal>
    </div>
  )
}
