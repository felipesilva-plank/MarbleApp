import type { Piece } from '@marble/core'
import { usePiecePhoto } from '../hooks/usePieces'
import { cx } from './ui'

const SIZES = {
  sm: 'h-10 w-10',
  md: 'h-16 w-16',
  lg: 'h-full w-full',
} as const

export function PieceThumb({
  piece,
  size = 'md',
  className,
}: {
  piece: Piece
  size?: keyof typeof SIZES
  className?: string
}) {
  const { data: url } = usePiecePhoto(piece.id, piece.hasPhoto)

  if (piece.hasPhoto && url) {
    return (
      <img
        src={url}
        alt={`Photo of ${piece.code}`}
        loading="lazy"
        className={cx('rounded-lg object-cover', SIZES[size], className)}
      />
    )
  }

  return (
    <div
      className={cx(
        'flex items-center justify-center rounded-lg bg-stone-200/70 text-stone-400',
        SIZES[size],
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-1/2 w-1/2" fill="none" stroke="currentColor">
        <path
          d="M4 16l4-5 3 3.5L14.5 10 20 16"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth="1.5" />
      </svg>
    </div>
  )
}
