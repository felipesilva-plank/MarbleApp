import { formatBytes, LOCALSTORAGE_BUDGET_BYTES } from '../lib/storage'
import type { StorageUsage } from '../lib/storage'
import { cx } from './ui'

/**
 * The bar is about localStorage specifically, not total origin usage: photos live in IndexedDB
 * with a quota orders of magnitude larger, so mixing them into one number would read as "plenty
 * of room" right up until a record write throws.
 */
export function StorageMeter({ usage }: { usage: StorageUsage }) {
  const pct = Math.round(usage.recordFraction * 100)
  const tight = usage.recordFraction >= 0.7

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-stone-500">Records (localStorage)</span>
        <span className={cx('text-xs font-medium', tight ? 'text-amber-700' : 'text-stone-600')}>
          {formatBytes(usage.recordBytes)} of ~{formatBytes(LOCALSTORAGE_BUDGET_BYTES)}
        </span>
      </div>

      <div
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-label="localStorage used"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cx('h-full rounded-full transition-all', tight ? 'bg-amber-500' : 'bg-stone-700')}
          style={{ width: `${Math.max(pct, 1)}%` }}
        />
      </div>

      {tight ? (
        <p className="mt-2 text-xs text-amber-700">
          Getting full. Export a backup now — writes start failing when this fills.
        </p>
      ) : null}

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <span className="text-xs text-stone-500">Photos and everything else (this site)</span>
        <span className="text-xs font-medium text-stone-600">
          {formatBytes(usage.originBytes)}
          {usage.originQuotaBytes !== null ? ` of ${formatBytes(usage.originQuotaBytes)}` : ''}
        </span>
      </div>
    </div>
  )
}
