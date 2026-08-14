import { useState } from 'react'
import { describeQuery, hasAnyFilter, isSameFilter, PRESET_NAME_MAX } from '@marble/core'
import type { FilterPreset } from '@marble/core'
import { Button, Input, cx } from './ui'

interface PresetBarProps {
  presets: FilterPreset[]
  /** The list's current query string, without a leading '?'. */
  currentQuery: string
  materialName: (id: string) => string | undefined
  onApply: (preset: FilterPreset) => void
  onSave: (name: string) => void
  onDelete: (preset: FilterPreset) => void
  saving?: boolean
  error?: string | null
}

export function PresetBar({
  presets,
  currentQuery,
  materialName,
  onApply,
  onSave,
  onDelete,
  saving = false,
  error = null,
}: PresetBarProps) {
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const canSave = hasAnyFilter(currentQuery)

  function submit() {
    const trimmed = name.trim()
    if (!trimmed) return
    onSave(trimmed)
    setName('')
    setNaming(false)
  }

  if (presets.length === 0 && !canSave) return null

  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((preset) => {
          const active = isSameFilter(preset.query, currentQuery)
          return (
            <span
              key={preset.id}
              className={cx(
                'inline-flex items-center overflow-hidden rounded-full border text-xs transition',
                active
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
              )}
            >
              <button
                type="button"
                className="cursor-pointer py-1.5 pr-1.5 pl-3 font-medium"
                title={describeQuery(preset.query, materialName)}
                aria-pressed={active}
                onClick={() => onApply(preset)}
              >
                {preset.name}
              </button>
              <button
                type="button"
                className={cx(
                  'cursor-pointer py-1.5 pr-2.5 pl-1 text-sm leading-none opacity-60 hover:opacity-100',
                )}
                aria-label={`Delete preset ${preset.name}`}
                onClick={() => onDelete(preset)}
              >
                ×
              </button>
            </span>
          )
        })}

        {naming ? (
          <span className="inline-flex items-center gap-1.5">
            <Input
              autoFocus
              value={name}
              maxLength={PRESET_NAME_MAX}
              placeholder="Preset name"
              aria-label="Preset name"
              className="h-8 w-44 !py-1 text-xs"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  submit()
                }
                if (event.key === 'Escape') {
                  setNaming(false)
                  setName('')
                }
              }}
            />
            <Button size="sm" variant="primary" onClick={submit} disabled={saving || !name.trim()}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setNaming(false)
                setName('')
              }}
            >
              Cancel
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={!canSave}
            title={canSave ? undefined : 'Set a filter first'}
            onClick={() => setNaming(true)}
          >
            + Save this filter
          </Button>
        )}
      </div>

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  )
}
