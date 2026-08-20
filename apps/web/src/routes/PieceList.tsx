import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import {
  PIECE_KINDS,
  PIECE_KIND_LABELS,
  PIECE_STATUSES,
  PIECE_STATUS_LABELS,
  areaM2,
  formatArea,
  formatDimensions,
  isUnlinked,
} from '@marble/core'
import type { PieceFilter, PieceKind, PieceStatus } from '@marble/core'
import type { FilterPreset } from '@marble/core'
import { errorMessage } from '../data'
import { usePieces } from '../hooks/usePieces'
import { useMaterialMap, useMaterials } from '../hooks/useMaterials'
import { useCreatePreset, useDeletePreset, usePresets } from '../hooks/usePresets'
import { formatRelative } from '../lib/format'
import { PresetBar } from '../components/PresetBar'
import { KindBadge, OrphanBadge, StatusBadge } from '../components/badges'
import { PieceThumb } from '../components/PieceThumb'
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  PageHeader,
  Select,
  cx,
} from '../components/ui'

function toNumber(value: string | null): number | null {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function PieceList() {
  const [params, setParams] = useSearchParams()
  const { data: materials } = useMaterials()
  const materialMap = useMaterialMap()

  const view = params.get('view') === 'grid' ? 'grid' : 'table'

  const filter = useMemo<PieceFilter>(
    () => ({
      q: params.get('q') ?? undefined,
      kind: (params.get('kind') as PieceKind | null) || null,
      status: (params.get('status') as PieceStatus | null) || null,
      materialId: params.get('material') || null,
      orphansOnly: params.get('unlinked') === '1',
      minLengthMm: toNumber(params.get('minL')),
      minWidthMm: toNumber(params.get('minW')),
      thicknessMm: toNumber(params.get('t')),
    }),
    [params],
  )

  const { data: pieces, isLoading } = usePieces(filter)
  const results = pieces ?? []

  const { data: presets } = usePresets()
  const createPreset = useCreatePreset()
  const deletePreset = useDeletePreset()
  const [presetError, setPresetError] = useState<string | null>(null)

  // Applying a preset replaces the filter params outright but leaves `view` alone: which columns
  // you like looking at is a separate preference from what you are filtering for.
  function applyPreset(preset: FilterPreset) {
    const next = new URLSearchParams(preset.query)
    const currentView = params.get('view')
    if (currentView) next.set('view', currentView)
    setPresetError(null)
    setParams(next, { replace: true })
  }

  async function savePreset(name: string) {
    setPresetError(null)
    try {
      await createPreset.mutateAsync({ name, query: params.toString() })
    } catch (caught) {
      setPresetError(errorMessage(caught))
    }
  }

  async function removePreset(preset: FilterPreset) {
    setPresetError(null)
    try {
      await deletePreset.mutateAsync(preset.id)
    } catch (caught) {
      setPresetError(errorMessage(caught))
    }
  }

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const activeFilterCount = ['kind', 'status', 'material', 'unlinked', 'minL', 'minW', 't'].filter(
    (key) => params.get(key),
  ).length

  const totalArea = results.reduce((sum, piece) => sum + areaM2(piece), 0)

  return (
    <div>
      <PageHeader
        title="Pieces"
        subtitle={
          isLoading
            ? undefined
            : `${results.length} piece${results.length === 1 ? '' : 's'} · ${formatArea(totalArea)} total surface`
        }
        actions={
          <>
            <div className="flex overflow-hidden rounded-lg border border-stone-300 bg-white">
              {(['table', 'grid'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setParam('view', mode === 'table' ? '' : mode)}
                  className={cx(
                    'px-3 py-2 text-sm font-medium capitalize transition',
                    view === mode ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100',
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
            <Link to="/pieces/new">
              <Button variant="primary">Add a piece</Button>
            </Link>
          </>
        }
      />

      <PresetBar
        presets={presets ?? []}
        currentQuery={params.toString()}
        materialName={(id) => materialMap.get(id)?.name}
        onApply={applyPreset}
        onSave={(name) => void savePreset(name)}
        onDelete={(preset) => void removePreset(preset)}
        saving={createPreset.isPending}
        error={presetError}
      />

      <Card className="mb-6 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" htmlFor="q" className="lg:col-span-2">
            <Input
              id="q"
              type="search"
              placeholder="Code, location or notes…"
              defaultValue={params.get('q') ?? ''}
              onChange={(event) => setParam('q', event.target.value)}
            />
          </Field>

          <Field label="Type" htmlFor="kind">
            <Select
              id="kind"
              value={params.get('kind') ?? ''}
              onChange={(event) => setParam('kind', event.target.value)}
            >
              <option value="">All types</option>
              {PIECE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {PIECE_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              value={params.get('status') ?? ''}
              onChange={(event) => setParam('status', event.target.value)}
            >
              <option value="">All statuses</option>
              {PIECE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PIECE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Material" htmlFor="material">
            <Select
              id="material"
              value={params.get('material') ?? ''}
              onChange={(event) => setParam('material', event.target.value)}
            >
              <option value="">All materials</option>
              {(materials ?? []).map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Min length (mm)" htmlFor="minL">
            <Input
              id="minL"
              type="number"
              min={1}
              placeholder="Any"
              defaultValue={params.get('minL') ?? ''}
              onChange={(event) => setParam('minL', event.target.value)}
            />
          </Field>

          <Field
            label="Min width (mm)"
            htmlFor="minW"
            hint="Pieces that fit when rotated also match."
          >
            <Input
              id="minW"
              type="number"
              min={1}
              placeholder="Any"
              defaultValue={params.get('minW') ?? ''}
              onChange={(event) => setParam('minW', event.target.value)}
            />
          </Field>

          <Field label="Thickness (mm)" htmlFor="t">
            <Input
              id="t"
              type="number"
              min={1}
              placeholder="Any"
              defaultValue={params.get('t') ?? ''}
              onChange={(event) => setParam('t', event.target.value)}
            />
          </Field>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-stone-300"
              checked={params.get('unlinked') === '1'}
              onChange={(event) => setParam('unlinked', event.target.checked ? '1' : '')}
            />
            Only pieces missing their source
          </label>

          {activeFilterCount > 0 || params.get('q') ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setParams(view === 'grid' ? { view: 'grid' } : {}, { replace: true })}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </Card>

      {isLoading ? (
        <Loading />
      ) : results.length === 0 ? (
        <EmptyState
          title="No pieces match these filters"
          description="Try widening the search, or add a new piece."
          action={
            <Link to="/pieces/new">
              <Button variant="primary">Add a piece</Button>
            </Link>
          }
        />
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((piece) => (
            <Link key={piece.id} to={`/pieces/${piece.id}`}>
              <Card className="h-full overflow-hidden transition hover:border-stone-300">
                <div className="aspect-[4/3] bg-stone-200/70">
                  <PieceThumb piece={piece} size="lg" className="rounded-none" />
                </div>
                <div className="p-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-stone-900">{piece.code}</span>
                    <KindBadge kind={piece.kind} />
                    <StatusBadge status={piece.status} />
                    {isUnlinked(piece) ? <OrphanBadge /> : null}
                  </div>
                  <p className="mt-1.5 text-xs text-stone-500">{formatDimensions(piece)}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {materialMap.get(piece.materialId ?? '')?.name ?? 'No material'}
                    {piece.location ? ` · ${piece.location}` : ''}
                  </p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-left text-xs tracking-wide text-stone-500 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Piece</th>
                  <th className="px-4 py-3 font-medium">Material</th>
                  <th className="px-4 py-3 font-medium">Dimensions</th>
                  <th className="px-4 py-3 font-medium">Area</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {results.map((piece) => (
                  <tr key={piece.id} className="transition hover:bg-stone-50">
                    <td className="px-4 py-3">
                      <Link to={`/pieces/${piece.id}`} className="flex items-center gap-3">
                        <PieceThumb piece={piece} size="sm" />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-medium text-stone-900">{piece.code}</span>
                            <KindBadge kind={piece.kind} />
                            {isUnlinked(piece) ? <OrphanBadge /> : null}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {materialMap.get(piece.materialId ?? '')?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-stone-600">{formatDimensions(piece)}</td>
                    <td className="px-4 py-3 text-stone-600">{formatArea(areaM2(piece))}</td>
                    <td className="px-4 py-3 text-stone-600">{piece.location || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={piece.status} />
                    </td>
                    <td className="px-4 py-3 text-stone-500">{formatRelative(piece.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
