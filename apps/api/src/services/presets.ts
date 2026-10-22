import { DomainError, filterPresetInputSchema, normalizeQuery, slugify } from '@marble/core'
import type { FilterPreset, FilterPresetInput } from '@marble/core'
import { db, isUniqueViolation } from '../db.ts'
import { toPreset } from '../mappers.ts'

export async function listPresets(orgId: string): Promise<FilterPreset[]> {
  const rows = await db().filterPreset.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } })
  return rows.map(toPreset)
}

export async function createPreset(
  orgId: string,
  input: FilterPresetInput,
): Promise<FilterPreset> {
  const parsed = filterPresetInputSchema.parse(input)
  const query = normalizeQuery(parsed.query)
  if (!query) throw new DomainError('VALIDATION', 'Set at least one filter before saving.')

  try {
    const row = await db().filterPreset.create({
      data: { orgId, name: parsed.name, slug: slugify(parsed.name), query },
    })
    return toPreset(row)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError('DUPLICATE', `A preset called "${parsed.name}" already exists.`)
    }
    throw error
  }
}

export async function removePreset(orgId: string, id: string): Promise<void> {
  const { count } = await db().filterPreset.deleteMany({ where: { id, orgId } })
  if (count === 0) throw new DomainError('NOT_FOUND', 'That preset no longer exists.')
}
