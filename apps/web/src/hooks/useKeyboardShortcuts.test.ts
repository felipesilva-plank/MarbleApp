import { describe, expect, it } from 'vitest'
import { isTypingTarget } from './useKeyboardShortcuts'

describe('isTypingTarget', () => {
  it.each(['INPUT', 'TEXTAREA', 'SELECT'])('is true for %s', (tag) => {
    expect(isTypingTarget(document.createElement(tag))).toBe(true)
  })

  it('is true for a contenteditable element', () => {
    const el = document.createElement('div')
    el.contentEditable = 'true'
    // jsdom does not derive isContentEditable from the attribute.
    Object.defineProperty(el, 'isContentEditable', { value: true })
    expect(isTypingTarget(el)).toBe(true)
  })

  it('is true for a custom field declaring role=textbox', () => {
    const el = document.createElement('div')
    el.setAttribute('role', 'textbox')
    expect(isTypingTarget(el)).toBe(true)
  })

  it('is false for an ordinary element', () => {
    expect(isTypingTarget(document.createElement('div'))).toBe(false)
  })

  it('is false for null, which is what a keydown on a detached target gives', () => {
    expect(isTypingTarget(null)).toBe(false)
  })
})
