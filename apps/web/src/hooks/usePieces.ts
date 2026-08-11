import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreatePieceInput, PieceFilter, UpdatePieceInput } from '@marble/core'
import { pieces } from '../data'

/**
 * These hooks talk only to the port. When the localStorage adapter is swapped for the HTTP one,
 * not a line in this file changes — the queries are already async and already have loading and
 * error states wired through the UI.
 */

export const pieceKeys = {
  all: ['pieces'] as const,
  list: (filter: PieceFilter) => ['pieces', 'list', filter] as const,
  detail: (id: string) => ['pieces', 'detail', id] as const,
  photo: (id: string) => ['pieces', 'photo', id] as const,
  locations: ['pieces', 'locations'] as const,
}

export function usePieces(filter: PieceFilter = {}) {
  return useQuery({
    queryKey: pieceKeys.list(filter),
    queryFn: () => pieces.list(filter),
  })
}

export function usePiece(id: string | undefined) {
  return useQuery({
    queryKey: pieceKeys.detail(id ?? ''),
    queryFn: () => pieces.get(id as string),
    enabled: Boolean(id),
  })
}

export function usePiecePhoto(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: pieceKeys.photo(id ?? ''),
    queryFn: () => pieces.getPhotoUrl(id as string),
    enabled: Boolean(id) && enabled,
  })
}

export function useKnownLocations() {
  return useQuery({
    queryKey: pieceKeys.locations,
    queryFn: () => pieces.knownLocations(),
  })
}

/** Every mutation invalidates the whole `pieces` tree: lineage edits ripple across many rows. */
function useInvalidatePieces() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: pieceKeys.all })
}

export function useCreatePiece() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: (input: CreatePieceInput) => pieces.create(input),
    onSuccess: invalidate,
  })
}

export function useUpdatePiece() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePieceInput }) =>
      pieces.update(id, input),
    onSuccess: invalidate,
  })
}

export function useAssignParent() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: ({ id, parentId }: { id: string; parentId: string | null }) =>
      pieces.assignParent(id, parentId),
    onSuccess: invalidate,
  })
}

export function useDeletePiece() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: ({ id, orphanChildren }: { id: string; orphanChildren?: boolean }) =>
      pieces.remove(id, { orphanChildren }),
    onSuccess: invalidate,
  })
}

export function useSetPhoto() {
  const invalidate = useInvalidatePieces()
  return useMutation({
    mutationFn: ({ id, dataUrl }: { id: string; dataUrl: string | null }) =>
      pieces.setPhoto(id, dataUrl),
    onSuccess: invalidate,
  })
}
