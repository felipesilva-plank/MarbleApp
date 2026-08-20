import { describe, expect, it } from 'vitest'
import { buildInfo } from './buildInfo'

/**
 * vitest does not run vite's `define` step, so this exercises exactly the path a `vite dev`
 * session takes: the constants are undefined and the app must still render something.
 */
describe('buildInfo', () => {
  it('falls back instead of throwing when the defines are absent', () => {
    const info = buildInfo()
    expect(info.version).toBe('0.0.0')
    expect(info.commit).toBe('dev')
    expect(info.builtAt).toBeNull()
  })
})
