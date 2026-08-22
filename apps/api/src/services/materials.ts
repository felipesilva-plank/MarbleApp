import { DomainError, materialInputSchema } from '@marble/core'
import type { Material, MaterialInput } from '@marble/core'
import { db, isUniqueViolation } from '../db.ts'
import { toMaterial } from '../mappers.ts'

const fold = (name: string) => name.trim().toLowerCase()

export async function listMaterials(orgId: string): Promise<Material[]> {
  const rows = await db().material.findMany({ where: { orgId }, orderBy: { name: 'asc' } })
  return rows.map(toMaterial)
}

export async function getMaterial(orgId: string, id: string): Promise<Material | null> {
  const row = await db().material.findFirst({ where: { id, orgId } })
  return row ? toMaterial(row) : null
}

export async function createMaterial(orgId: string, input: MaterialInput): Promise<Material> {
  const parsed = materialInputSchema.parse(input)
  const name = parsed.name.trim()

  try {
    const row = await db().material.create({
      data: {
        orgId,
        name,
        nameFolded: fold(name),
        color: parsed.color.trim(),
        finish: parsed.finish.trim(),
        notes: parsed.notes.trim(),
      },
    })
    return toMaterial(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError('DUPLICATE', `A material called "${name}" already exists.`)
    }
    throw error
  }
}

export async function updateMaterial(
  orgId: string,
  id: string,
  input: Partial<MaterialInput>,
): Promise<Material> {
  const parsed = materialInputSchema.partial().parse(input)
  const existing = await db().material.findFirst({ where: { id, orgId } })
  if (!existing) throw new DomainError('NOT_FOUND', 'That material no longer exists.')

  const name = parsed.name?.trim() ?? existing.name

  try {
    const row = await db().material.update({
      where: { id },
      data: {
        name,
        nameFolded: fold(name),
        color: parsed.color?.trim(),
        finish: parsed.finish?.trim(),
        notes: parsed.notes?.trim(),
      },
    })
    return toMaterial(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError('DUPLICATE', `A material called "${name}" already exists.`)
    }
    throw error
  }
}

/**
 * Pieces made of this material keep existing; their `materialId` goes null.
 *
 * That is `onDelete: SetNull` on the relation rather than a manual sweep — leaving a dangling id
 * would render as a blank material field with no way to diagnose it, and deleting the pieces
 * would destroy inventory because someone tidied a lookup table.
 */
export async function removeMaterial(orgId: string, id: string): Promise<void> {
  const { count } = await db().material.deleteMany({ where: { id, orgId } })
  if (count === 0) throw new DomainError('NOT_FOUND', 'That material no longer exists.')
}
