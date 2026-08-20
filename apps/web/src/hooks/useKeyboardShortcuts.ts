import { useEffect } from 'react'

export interface Shortcut {
  /** `event.key`, matched case-sensitively so `?` and `/` behave. */
  key: string
  label: string
  run: () => void
}

/**
 * True when the user is typing. Every shortcut here is a bare letter, so firing one while an
 * input has focus would eat the keystroke - the single thing that makes people turn shortcuts off.
 * `isContentEditable` covers rich-text fields; `role="textbox"` covers custom ones.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target.getAttribute('role') === 'textbox') return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function useKeyboardShortcuts(shortcuts: readonly Shortcut[], enabled = true): void {
  useEffect(() => {
    if (!enabled) return

    function onKeyDown(event: KeyboardEvent) {
      // Never shadow a browser or OS shortcut. Cmd+K belongs to the browser, not to us.
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return

      const match = shortcuts.find((s) => s.key === event.key)
      if (!match) return

      event.preventDefault()
      match.run()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shortcuts, enabled])
}
