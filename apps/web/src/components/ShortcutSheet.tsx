import type { Shortcut } from '../hooks/useKeyboardShortcuts'
import { Modal } from './ui'

export function ShortcutSheet({
  open,
  onClose,
  shortcuts,
}: {
  open: boolean
  onClose: () => void
  shortcuts: readonly Shortcut[]
}) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
        {shortcuts.map((shortcut) => (
          <div key={shortcut.key} className="contents">
            <dt>
              <kbd className="rounded border border-stone-300 bg-stone-100 px-2 py-0.5 font-mono text-xs text-stone-700">
                {shortcut.key === ' ' ? 'Space' : shortcut.key}
              </kbd>
            </dt>
            <dd className="text-stone-700">{shortcut.label}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-stone-500">
        Shortcuts are ignored while you are typing in a field.
      </p>
    </Modal>
  )
}
