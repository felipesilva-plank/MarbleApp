import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FilterPresetInput } from '@marble/core'
import { presets } from '../data'

export const presetKeys = {
  all: ['presets'] as const,
  list: ['presets', 'list'] as const,
}

export function usePresets() {
  return useQuery({
    queryKey: presetKeys.list,
    queryFn: () => presets.list(),
  })
}

function useInvalidatePresets() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: presetKeys.all })
}

export function useCreatePreset() {
  const invalidate = useInvalidatePresets()
  return useMutation({
    mutationFn: (input: FilterPresetInput) => presets.create(input),
    onSuccess: invalidate,
  })
}

export function useDeletePreset() {
  const invalidate = useInvalidatePresets()
  return useMutation({
    mutationFn: (id: string) => presets.remove(id),
    onSuccess: invalidate,
  })
}
