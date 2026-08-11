import { useMemo, useState } from 'react'
import { formatDimensions } from '@marble/core'
import type { Piece } from '@marble/core'
import { KindBadge, StatusBadge } from './badges'
import { Input, cx } from './ui'

/**
 * Choose the piece something was cut from.
 *
 * `excludeIds` must contain the piece itself and every descendant — otherwise the user can
 * build a loop. The repository rejects cycles too, but blocking them here means the user never
 * gets to make the mistake in the first place.
 */
export function ParentPicker({
  pieces,
  excludeIds,
  value,
  onChange,
  emptyLabel = 'No source — arrived from a supplier, or the origin is unknown',
}: {
  pieces: Piece[]
  excludeIds: Set<string>
  value: string | null
  onChange: (parentId: string | null) => void
  emptyLabel?: string
}) {
  const [query, setQuery] = useState('')

  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return pieces
      .filter((p) => !excludeIds.has(p.id))
      .filter((p) => {
        if (!needle) return true
        return `${p.code} ${p.location} ${p.notes}`.toLowerCase().includes(needle)
      })
      .sort((a, b) => a.code.localeCompare(b.code))
      .slice(0, 100)
  }, [pieces, excludeIds, query])

  return (
    <div className="rounded-lg border border-stone-300 bg-white">
      <div className="border-b border-stone-200 p-2">
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by code, location or notes…"
          aria-label="Search for a source piece"
        />
      </div>

      <div className="max-h-64 overflow-y-auto p-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cx(
            'w-full rounded-md px-3 py-2 text-left text-sm transition',
            value === null ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100',
          )}
        >
          {emptyLabel}
        </button>

        {candidates.map((piece) => {
          const selected = piece.id === value
          return (
            <button
              key={piece.id}
              type="button"
              onClick={() => onChange(piece.id)}
              className={cx(
                'mt-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-left transition',
                selected ? 'bg-stone-900 text-white' : 'hover:bg-stone-100',
              )}
            >
              <span className="font-medium">{piece.code}</span>
              {selected ? null : <KindBadge kind={piece.kind} />}
              {selected ? null : <StatusBadge status={piece.status} />}
              <span
                className={cx(
                  'ml-auto truncate text-xs',
                  selected ? 'text-stone-300' : 'text-stone-500',
                )}
              >
                {formatDimensions(piece)}
              </span>
            </button>
          )
        })}

        {candidates.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-stone-500">
            No eligible pieces match “{query}”.
          </p>
        ) : null}
      </div>
    </div>
  )
}
