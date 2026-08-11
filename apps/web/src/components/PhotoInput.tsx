import { usePiecePhoto, useSetPhoto } from '../hooks/usePieces'
import { PhotoPicker } from './PhotoPicker'

/**
 * The persisted variant, for a piece that already exists: every change writes straight through
 * to storage. Before a piece exists, use PhotoPicker directly and hold the value in form state.
 */
export function PhotoInput({ pieceId, hasPhoto }: { pieceId: string; hasPhoto: boolean }) {
  const { data: url } = usePiecePhoto(pieceId, hasPhoto)
  const setPhoto = useSetPhoto()

  return (
    <PhotoPicker
      value={hasPhoto ? (url ?? null) : null}
      onChange={(dataUrl) => setPhoto.mutateAsync({ id: pieceId, dataUrl })}
    />
  )
}
