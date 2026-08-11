import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { materialInputSchema } from '@marble/core'
import type { Material, MaterialInput } from '@marble/core'
import { errorMessage } from '../data'
import {
  useCreateMaterial,
  useDeleteMaterial,
  useMaterials,
  useUpdateMaterial,
} from '../hooks/useMaterials'
import { usePieces } from '../hooks/usePieces'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Spinner,
  Textarea,
} from '../components/ui'

const EMPTY: MaterialInput = { name: '', color: '', finish: '', notes: '' }

export function Materials() {
  const { data: materials, isLoading } = useMaterials()
  const { data: pieces } = usePieces()
  const createMaterial = useCreateMaterial()
  const updateMaterial = useUpdateMaterial()
  const deleteMaterial = useDeleteMaterial()

  const [editing, setEditing] = useState<Material | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Material | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MaterialInput>({
    resolver: zodResolver(materialInputSchema),
    defaultValues: EMPTY,
  })

  const usageCount = (materialId: string) =>
    (pieces ?? []).filter((p) => p.materialId === materialId).length

  function openCreate() {
    setError(null)
    reset(EMPTY)
    setEditing(null)
    setCreating(true)
  }

  function openEdit(material: Material) {
    setError(null)
    reset({
      name: material.name,
      color: material.color,
      finish: material.finish,
      notes: material.notes,
    })
    setCreating(false)
    setEditing(material)
  }

  function closeForm() {
    setCreating(false)
    setEditing(null)
    setError(null)
  }

  async function onSubmit(values: MaterialInput) {
    setError(null)
    try {
      if (editing) await updateMaterial.mutateAsync({ id: editing.id, input: values })
      else await createMaterial.mutateAsync(values)
      closeForm()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setError(null)
    try {
      await deleteMaterial.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (caught) {
      setError(errorMessage(caught))
      setDeleting(null)
    }
  }

  if (isLoading) return <Loading />

  const list = materials ?? []

  return (
    <div>
      <PageHeader
        title="Materials"
        subtitle="Define each stone once, then pick it when registering a piece."
        actions={
          <Button variant="primary" onClick={openCreate}>
            Add material
          </Button>
        }
      />

      {error && !creating && !editing ? (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      {list.length === 0 ? (
        <EmptyState
          title="No materials yet"
          description="Add the stones you work with so you can filter your inventory by material."
          action={
            <Button variant="primary" onClick={openCreate}>
              Add material
            </Button>
          }
        />
      ) : (
        <Card className="divide-y divide-stone-100">
          {list.map((material) => {
            const count = usageCount(material.id)
            return (
              <div
                key={material.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 transition hover:bg-stone-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-stone-900">{material.name}</p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {[material.color, material.finish].filter(Boolean).join(' · ') ||
                      'No description'}
                  </p>
                </div>
                <span className="text-xs text-stone-500">
                  {count} piece{count === 1 ? '' : 's'}
                </span>
                <div className="flex gap-1">
                  <Button size="sm" onClick={() => openEdit(material)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleting(material)}>
                    Delete
                  </Button>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      <Modal
        open={creating || editing !== null}
        onClose={closeForm}
        title={editing ? `Edit ${editing.name}` : 'Add a material'}
        footer={
          <>
            <Button onClick={closeForm} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit(onSubmit)}
              disabled={isSubmitting}
            >
              {isSubmitting ? <Spinner /> : null}
              {editing ? 'Save changes' : 'Add material'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error ? <Alert>{error}</Alert> : null}

          <Field label="Name" error={errors.name?.message} htmlFor="name">
            <Input id="name" placeholder="Carrara White" autoFocus {...register('name')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Colour" error={errors.color?.message} htmlFor="color">
              <Input id="color" placeholder="White with grey veining" {...register('color')} />
            </Field>
            <Field label="Finish" error={errors.finish?.message} htmlFor="finish">
              <Input id="finish" placeholder="Polished" {...register('finish')} />
            </Field>
          </div>

          <Field label="Notes" error={errors.notes?.message} htmlFor="notes">
            <Textarea id="notes" rows={2} {...register('notes')} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name}?`}
        footer={
          <>
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => void confirmDelete()}>
              Delete material
            </Button>
          </>
        }
      >
        <p>
          {deleting && usageCount(deleting.id) > 0
            ? `${usageCount(deleting.id)} piece${usageCount(deleting.id) === 1 ? '' : 's'} use this material. They will be kept, but their material field will be cleared.`
            : 'No pieces use this material.'}
        </p>
      </Modal>
    </div>
  )
}
