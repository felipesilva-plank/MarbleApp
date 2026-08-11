import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Material, MaterialInput } from '@marble/core'
import { useMemo } from 'react'
import { materials } from '../data'
import { pieceKeys } from './usePieces'

export const materialKeys = {
  all: ['materials'] as const,
}

export function useMaterials() {
  return useQuery({
    queryKey: materialKeys.all,
    queryFn: () => materials.list(),
  })
}

/** id -> Material, for rendering a piece's material without an N+1 of lookups. */
export function useMaterialMap(): Map<string, Material> {
  const { data } = useMaterials()
  return useMemo(() => new Map((data ?? []).map((m) => [m.id, m])), [data])
}

function useInvalidateMaterials() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: materialKeys.all })
    // Deleting a material clears materialId on the pieces that referenced it.
    queryClient.invalidateQueries({ queryKey: pieceKeys.all })
  }
}

export function useCreateMaterial() {
  const invalidate = useInvalidateMaterials()
  return useMutation({
    mutationFn: (input: MaterialInput) => materials.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdateMaterial() {
  const invalidate = useInvalidateMaterials()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<MaterialInput> }) =>
      materials.update(id, input),
    onSuccess: invalidate,
  })
}

export function useDeleteMaterial() {
  const invalidate = useInvalidateMaterials()
  return useMutation({
    mutationFn: (id: string) => materials.remove(id),
    onSuccess: invalidate,
  })
}
