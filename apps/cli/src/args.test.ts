import { describe, expect, it } from 'vitest'
import { parseArgs } from './args.js'

describe('parseArgs', () => {
  it('is empty for no arguments', () => {
    expect(parseArgs([])).toEqual({ help: false, errors: [] })
  })

  it('reads long and short forms alike', () => {
    expect(parseArgs(['--model', 'haiku', '-t', '0.2'])).toMatchObject({
      model: 'haiku',
      temperature: 0.2,
    })
    expect(parseArgs(['-m', 'opus'])).toMatchObject({ model: 'opus' })
  })

  it('collects trailing words into a first prompt', () => {
    expect(parseArgs(['-m', 'haiku', 'what', 'is', 'a', 'remnant']).prompt).toBe(
      'what is a remnant',
    )
  })

  it('treats an unknown dash-flag as a typo, not as a prompt', () => {
    // Its stray value still lands in `prompt`, which is harmless: any error aborts before the
    // prompt is read, and guessing which unknown flags take a value would be worse.
    expect(parseArgs(['--modle', 'haiku']).errors).toContain('Unknown option "--modle".')
  })

  it('rejects a temperature outside 0-1', () => {
    expect(parseArgs(['-t', '2']).errors[0]).toMatch(/between 0 and 1/)
  })

  it('rejects a non-numeric temperature', () => {
    expect(parseArgs(['-t', 'hot']).errors[0]).toMatch(/expects a number/)
  })

  it('rejects a fractional max-tokens', () => {
    expect(parseArgs(['--max-tokens', '1.5']).errors[0]).toMatch(/whole number/)
  })

  it('reports a flag given with no value', () => {
    expect(parseArgs(['--model']).errors).toContain('--model needs a value.')
  })

  it('keeps a multi-word system prompt as one value', () => {
    expect(parseArgs(['-s', 'Be blunt and short.']).system).toBe('Be blunt and short.')
  })

  it('collects every error rather than stopping at the first', () => {
    expect(parseArgs(['-t', '9', '--max-tokens', '0', '--nope']).errors).toHaveLength(3)
  })

  it('sets help for -h and --help', () => {
    expect(parseArgs(['-h']).help).toBe(true)
    expect(parseArgs(['--help']).help).toBe(true)
  })
})
