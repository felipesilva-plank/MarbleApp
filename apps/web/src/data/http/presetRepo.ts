import type { FilterPreset, FilterPresetInput } from '@marble/core'
import type { PresetRepository } from '../ports'
import { apiGet, apiSend } from './client'

export const httpPresetRepository: PresetRepository = {
  async list(): Promise<FilterPreset[]> {
    const { presets } = await apiGet<{ presets: FilterPreset[] }>('/api/presets')
    return presets
  },

  async create(input: FilterPresetInput): Promise<FilterPreset> {
    const { preset } = await apiSend<{ preset: FilterPreset }>('/api/presets', 'POST', input)
    return preset
  },

  async remove(id: string): Promise<void> {
    await apiSend(`/api/presets/${id}`, 'DELETE')
  },
}
