import type { Material, MaterialInput, Piece } from '@marble/core'
import { DomainError } from '../errors'
import type { MaterialRepository } from '../ports'
import { KEYS, ORG_ID, newId, nowIso, readJson, writeJson } from './db'
import { readPieces, writePieces } from './pieceRepo'

function readMaterials(): Material[] {
  return readJson<Material[]>(KEYS.materials, [])
}

export function writeMaterials(materials: Material[]): void {
  writeJson(KEYS.materials, materials)
}

export const localMaterialRepository: MaterialRepository = {
  async list(): Promise<Material[]> {
    return readMaterials().sort((a, b) => a.name.localeCompare(b.name))
  },

  async get(id: string): Promise<Material | null> {
    return readMaterials().find((m) => m.id === id) ?? null
  },

  async create(input: MaterialInput): Promise<Material> {
    const materials = readMaterials()
    const name = input.name.trim()

    if (materials.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      throw new DomainError('DUPLICATE', `A material called "${name}" already exists.`)
    }

    const material: Material = {
      id: newId(),
      orgId: ORG_ID,
      name,
      color: input.color.trim(),
      finish: input.finish.trim(),
      notes: input.notes.trim(),
      createdAt: nowIso(),
    }

    writeMaterials([...materials, material])
    return material
  },

  async update(id: string, input: Partial<MaterialInput>): Promise<Material> {
    const materials = readMaterials()
    const existing = materials.find((m) => m.id === id)
    if (!existing) throw new DomainError('NOT_FOUND', 'That material no longer exists.')

    const updated: Material = {
      ...existing,
      ...input,
      name: (input.name ?? existing.name).trim(),
      color: (input.color ?? existing.color).trim(),
      finish: (input.finish ?? existing.finish).trim(),
      notes: (input.notes ?? existing.notes).trim(),
    }

    writeMaterials(materials.map((m) => (m.id === id ? updated : m)))
    return updated
  },

  async remove(id: string): Promise<void> {
    const materials = readMaterials()
    if (!materials.some((m) => m.id === id)) {
      throw new DomainError('NOT_FOUND', 'That material no longer exists.')
    }

    // Clear the reference rather than leaving pieces pointing at a material that no longer
    // exists — a dangling id would render as a blank material field with no way to diagnose it.
    const pieces: Piece[] = readPieces()
    if (pieces.some((p) => p.materialId === id)) {
      writePieces(
        pieces.map((p) => (p.materialId === id ? { ...p, materialId: null, updatedAt: nowIso() } : p)),
      )
    }

    writeMaterials(materials.filter((m) => m.id !== id))
  },
}
