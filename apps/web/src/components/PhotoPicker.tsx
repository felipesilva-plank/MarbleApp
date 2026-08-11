import { useRef, useState } from 'react'
import { errorMessage } from '../data'
import { approximateDataUrlBytes, compressImage, formatBytes } from '../lib/image'
import { Alert, Button, Spinner } from './ui'

/**
 * Presentational photo control. Holds no persistence of its own, so it works both before a piece
 * exists (the create form keeps the data URL in memory) and after (the detail page writes it
 * straight through to storage).
 *
 * `onChange` may be async and may throw — failures surface inline rather than bubbling out.
 */
export function PhotoPicker({
  value,
  onChange,
  disabled = false,
  emptyHint,
}: {
  value: string | null
  onChange: (dataUrl: string | null) => void | Promise<void>
  disabled?: boolean
  emptyHint?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function apply(dataUrl: string | null) {
    setWorking(true)
    setError(null)
    try {
      await onChange(dataUrl)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setWorking(false)
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    setWorking(true)
    setError(null)
    try {
      // Downscale before it ever reaches storage — phone photos are 3-8 MB apiece.
      const dataUrl = await compressImage(file)
      await onChange(dataUrl)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setWorking(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const busy = working || disabled

  return (
    <div className="space-y-3">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-stone-200/70">
        {value ? (
          <img src={value} alt="Piece" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-stone-400">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor">
              <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth="1.5" />
              <path
                d="M4 16l4-5 3 3.5L14.5 10 20 16"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xs">{emptyHint ?? 'No photo'}</span>
          </div>
        )}
      </div>

      {error ? <Alert>{error}</Alert> : null}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
        <Button size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
          {working ? <Spinner /> : null}
          {value ? 'Replace photo' : 'Add photo'}
        </Button>
        {value ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void apply(null)}>
            Remove
          </Button>
        ) : null}
        {value ? (
          <span className="text-xs text-stone-400">
            {formatBytes(approximateDataUrlBytes(value))}
          </span>
        ) : null}
      </div>
    </div>
  )
}
