import { useRef, useState } from 'react'
import { errorMessage } from '../data'
import { usePiecePhoto, useSetPhoto } from '../hooks/usePieces'
import { approximateDataUrlBytes, compressImage, formatBytes } from '../lib/image'
import { Alert, Button, Spinner } from './ui'

export function PhotoInput({ pieceId, hasPhoto }: { pieceId: string; hasPhoto: boolean }) {
  const { data: url } = usePiecePhoto(pieceId, hasPhoto)
  const setPhoto = useSetPhoto()
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const dataUrl = await compressImage(file)
      await setPhoto.mutateAsync({ id: pieceId, dataUrl })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleRemove() {
    setBusy(true)
    setError(null)
    try {
      await setPhoto.mutateAsync({ id: pieceId, dataUrl: null })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-stone-200/70">
        {hasPhoto && url ? (
          <img src={url} alt="Piece" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-stone-400">
            <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor">
              <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth="1.5" />
              <path
                d="M4 16l4-5 3 3.5L14.5 10 20 16"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="text-xs">No photo</span>
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
          {busy ? <Spinner /> : null}
          {hasPhoto ? 'Replace photo' : 'Add photo'}
        </Button>
        {hasPhoto ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleRemove()}>
            Remove
          </Button>
        ) : null}
        {url ? (
          <span className="text-xs text-stone-400">
            {formatBytes(approximateDataUrlBytes(url))}
          </span>
        ) : null}
      </div>
    </div>
  )
}
