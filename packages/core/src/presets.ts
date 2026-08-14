import { z } from 'zod'
import { PIECE_KIND_LABELS, PIECE_STATUS_LABELS } from './types'
import type { PieceKind, PieceStatus } from './types'

/**
 * A saved filter is a saved **query string**, not a parsed filter object.
 *
 * The URL is already the source of truth for filter state on the piece list. Storing a second,
 * structured representation would mean keeping two things in sync forever, and would break every
 * saved preset the moment a new filter param is added. A raw query string degrades gracefully:
 * params the app no longer reads are simply ignored.
 */
export interface FilterPreset {
  id: string
  orgId: string
  name: string
  /** Derived from name. Stable identifier for a future shareable URL. */
  slug: string
  /** URLSearchParams string, without a leading '?'. e.g. 'kind=remnant&t=30' */
  query: string
  createdAt: string
}

export const PRESET_NAME_MAX = 40

export const filterPresetInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Give the preset a name')
    .max(PRESET_NAME_MAX, `Keep it under ${PRESET_NAME_MAX} characters`),
  query: z.string().min(1, 'Set at least one filter before saving'),
})

export type FilterPresetInput = z.infer<typeof filterPresetInputSchema>

export const filterPresetRecordSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  slug: z.string(),
  query: z.string(),
  createdAt: z.string(),
})

export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      // Strip accents so "Mármore fino" and "Marmore fino" produce the same slug.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'preset'
  )
}

/**
 * Params that carry no filtering meaning. A preset whose only difference is the view mode is not
 * a different preset, and saving one from a bare `?view=grid` would be an empty preset.
 */
const NON_FILTER_PARAMS = new Set(['view', 'sort', 'page', 'preset'])

/** Sorted so two equal filters reached by different click orders produce the same string. */
export function normalizeQuery(query: string): string {
  const params = new URLSearchParams(query)
  const kept = [...params.entries()]
    .filter(([key, value]) => value !== '' && !NON_FILTER_PARAMS.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
  return new URLSearchParams(kept).toString()
}

export function hasAnyFilter(query: string): boolean {
  return normalizeQuery(query).length > 0
}

export function isSameFilter(a: string, b: string): boolean {
  return normalizeQuery(a) === normalizeQuery(b)
}

/**
 * Human summary of a saved query, for the chip's tooltip. Resolving material ids to names needs
 * data this package does not have, so the caller passes a lookup.
 */
export function describeQuery(
  query: string,
  materialName: (id: string) => string | undefined = () => undefined,
): string {
  const params = new URLSearchParams(normalizeQuery(query))
  const parts: string[] = []

  const kind = params.get('kind')
  if (kind) parts.push(PIECE_KIND_LABELS[kind as PieceKind] ?? kind)

  const status = params.get('status')
  if (status) parts.push(PIECE_STATUS_LABELS[status as PieceStatus] ?? status)

  const material = params.get('material')
  if (material) parts.push(materialName(material) ?? 'Unknown material')

  if (params.get('unlinked') === '1') parts.push('Unlinked only')

  const minL = params.get('minL')
  const minW = params.get('minW')
  if (minL || minW) parts.push(`At least ${minL ?? '?'} x ${minW ?? '?'} mm`)

  const thickness = params.get('t')
  if (thickness) parts.push(`${thickness} mm thick`)

  const q = params.get('q')
  if (q) parts.push(`"${q}"`)

  return parts.length > 0 ? parts.join(' · ') : 'No filters'
}
