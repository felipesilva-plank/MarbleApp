import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import {
  PIECE_KINDS,
  PIECE_KIND_LABELS,
  PIECE_STATUSES,
  PIECE_STATUS_LABELS,
  areaM2,
  createPieceSchema,
  formatArea,
} from '@marble/core'
import type { CreatePieceInput, Material, Piece } from '@marble/core'
import { ParentPicker } from './ParentPicker'
import { PhotoPicker } from './PhotoPicker'
import { Alert, Button, Card, Field, Input, Select, SectionTitle, Spinner, Textarea } from './ui'

export function PieceForm({
  mode,
  defaultValues,
  allPieces,
  materials,
  locations,
  excludeIds,
  photo,
  onPhotoChange,
  onSubmit,
  onCancel,
  submitting,
  error,
  submitLabel,
}: {
  mode: 'create' | 'edit'
  defaultValues: CreatePieceInput
  allPieces: Piece[]
  materials: Material[]
  locations: string[]
  excludeIds?: Set<string>
  /** Held in the parent's state until the piece exists and the photo can be attached to it. */
  photo?: string | null
  onPhotoChange?: (dataUrl: string | null) => void
  onSubmit: (values: CreatePieceInput) => void | Promise<void>
  onCancel: () => void
  submitting: boolean
  error?: string | null
  submitLabel: string
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreatePieceInput>({
    resolver: zodResolver(createPieceSchema),
    defaultValues,
  })

  const parentId = watch('parentId')
  const lengthMm = watch('lengthMm')
  const widthMm = watch('widthMm')

  const areaKnown = Number.isFinite(lengthMm) && Number.isFinite(widthMm) && lengthMm > 0 && widthMm > 0
  const parent = allPieces.find((p) => p.id === parentId) ?? null

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error ? <Alert>{error}</Alert> : null}

      <Card className="p-5">
        <SectionTitle>Stone</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type" error={errors.kind?.message} htmlFor="kind">
            <Select id="kind" {...register('kind')}>
              {PIECE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {PIECE_KIND_LABELS[kind]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Status"
            error={errors.status?.message}
            htmlFor="status"
            hint="You control this. Registering cut pieces never changes it automatically."
          >
            <Select id="status" {...register('status')}>
              {PIECE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {PIECE_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Material"
            error={errors.materialId?.message}
            htmlFor="materialId"
            className="sm:col-span-2"
          >
            <Select
              id="materialId"
              {...register('materialId', {
                setValueAs: (value: string) => (value === '' ? null : value),
              })}
            >
              <option value="">— No material —</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                  {material.finish ? ` · ${material.finish}` : ''}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>Dimensions</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Length (mm)" error={errors.lengthMm?.message} htmlFor="lengthMm">
            <Input
              id="lengthMm"
              type="number"
              inputMode="numeric"
              min={1}
              {...register('lengthMm', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Width (mm)" error={errors.widthMm?.message} htmlFor="widthMm">
            <Input
              id="widthMm"
              type="number"
              inputMode="numeric"
              min={1}
              {...register('widthMm', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Thickness (mm)" error={errors.thicknessMm?.message} htmlFor="thicknessMm">
            <Input
              id="thicknessMm"
              type="number"
              inputMode="numeric"
              min={1}
              {...register('thicknessMm', { valueAsNumber: true })}
            />
          </Field>
        </div>
        <p className="mt-3 text-sm text-stone-500">
          Surface area:{' '}
          <span className="font-medium text-stone-800">
            {areaKnown ? formatArea(areaM2({ lengthMm, widthMm })) : '—'}
          </span>
        </p>
      </Card>

      {onPhotoChange ? (
        <Card className="p-5">
          <SectionTitle>Photo</SectionTitle>
          <p className="mb-3 text-sm text-stone-600">
            Optional, and the fastest way to recognise this piece later — remnant hunting is
            mostly visual.
          </p>
          <div className="max-w-sm">
            <PhotoPicker
              value={photo ?? null}
              onChange={onPhotoChange}
              disabled={submitting}
              emptyHint="No photo yet"
            />
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <SectionTitle>Storage</SectionTitle>
        <div className="space-y-4">
          <Field
            label="Location"
            error={errors.location?.message}
            htmlFor="location"
            hint="Where someone can physically find it, e.g. “Yard A / Rack 3”."
          >
            <Input id="location" list="known-locations" {...register('location')} />
            <datalist id="known-locations">
              {locations.map((location) => (
                <option key={location} value={location} />
              ))}
            </datalist>
          </Field>

          <Field label="Notes" error={errors.notes?.message} htmlFor="notes">
            <Textarea id="notes" rows={3} {...register('notes')} />
          </Field>
        </div>
      </Card>

      {mode === 'create' ? (
        <Card className="p-5">
          <SectionTitle>Cut from</SectionTitle>
          <p className="mb-3 text-sm text-stone-600">
            {parent ? (
              <>
                This piece will be recorded as cut from{' '}
                <span className="font-medium text-stone-900">{parent.code}</span>.
              </>
            ) : (
              'Leave this empty if the stone came from a supplier, or if you genuinely do not know its origin — you can link it later.'
            )}
          </p>
          <input type="hidden" {...register('parentId')} />
          <ParentPicker
            pieces={allPieces}
            excludeIds={excludeIds ?? new Set()}
            value={parentId}
            onChange={(id) => setValue('parentId', id, { shouldDirty: true })}
          />
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={submitting}>
          {submitting ? <Spinner /> : null}
          {submitLabel}
        </Button>
        <Button onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
