import { useQuery } from '@tanstack/react-query'
import { auth } from '../data'

export const orgKeys = {
  current: ['org', 'current'] as const,
}

/** The shop the signed-in user belongs to. Rarely changes, so it is cached for the session. */
export function useOrg() {
  return useQuery({
    queryKey: orgKeys.current,
    queryFn: () => auth.currentOrg(),
    staleTime: Number.POSITIVE_INFINITY,
  })
}
