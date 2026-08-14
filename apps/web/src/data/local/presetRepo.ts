import { filterPresetInputSchema, slugify, normalizeQuery } from '@marble/core'
import type { FilterPreset, FilterPresetInput } from '@marble/core'
import { DomainError } from '../errors'
import type { PresetRepository } from '../ports'
import { KEYS, ORG_ID, newId, nowIso, readJson, writeJson } from './db'

export function readPresets(): FilterPreset[] {
  return readJson<FilterPreset[]>(KEYS.presets, [])
}

export function writePresets(presets: FilterPreset[]): void {
  writeJson(KEYS.presets, presets)
}

export const localPresetRepository: PresetRepository = {
  async list(): Promise<FilterPreset[]> {
    // Newest last: presets are a row of chips, and a new one appearing at the end is where the
    // user's eye already is after saving.
    return [...readPresets()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  },

  async create(input: FilterPresetInput): Promise<FilterPreset> {
    const parsed = filterPresetInputSchema.parse(input)
    const query = normalizeQuery(parsed.query)

    if (query.length === 0) {
      // VALIDATION, not DUPLICATE: nothing conflicts, the input is just empty. These map to 400
      // and 409 respectively once the API exists.
      throw new DomainError('VALIDATION', 'Set at least one filter before saving a preset.')
    }

    const presets = readPresets()
    const name = parsed.name.trim()

    if (presets.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      throw new DomainError('DUPLICATE', `A preset called "${name}" already exists.`)
    }

    const preset: FilterPreset = {
      id: newId(),
      orgId: ORG_ID,
      name,
      slug: slugify(name),
      query,
      createdAt: nowIso(),
    }

    writePresets([...presets, preset])
    return preset
  },

  async remove(id: string): Promise<void> {
    const presets = readPresets()
    if (!presets.some((p) => p.id === id)) {
      throw new DomainError('NOT_FOUND', 'That preset no longer exists.')
    }
    writePresets(presets.filter((p) => p.id !== id))
  },
}
