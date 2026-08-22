import type { Material, MaterialInput } from '@marble/core'
import type { MaterialRepository } from '../ports'
import { apiGet, apiSend } from './client'

export const httpMaterialRepository: MaterialRepository = {
  async list(): Promise<Material[]> {
    const { materials } = await apiGet<{ materials: Material[] }>('/api/materials')
    return materials
  },

  async get(id: string): Promise<Material | null> {
    try {
      const { material } = await apiGet<{ material: Material }>(`/api/materials/${id}`)
      return material
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') return null
      throw error
    }
  },

  async create(input: MaterialInput): Promise<Material> {
    const { material } = await apiSend<{ material: Material }>('/api/materials', 'POST', input)
    return material
  },

  async update(id: string, input: Partial<MaterialInput>): Promise<Material> {
    const { material } = await apiSend<{ material: Material }>(
      `/api/materials/${id}`,
      'PATCH',
      input,
    )
    return material
  },

  async remove(id: string): Promise<void> {
    await apiSend(`/api/materials/${id}`, 'DELETE')
  },
}
