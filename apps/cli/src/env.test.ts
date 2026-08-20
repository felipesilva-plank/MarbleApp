import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadLocalEnv } from './env.js'

const touched = ['MARBLE_ENV_TEST', 'MARBLE_ENV_EXISTING']

afterEach(() => {
  for (const key of touched) delete process.env[key]
})

describe('loadLocalEnv', () => {
  it('loads values from the file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'marble-env-'))
    const path = join(dir, '.env.local')
    await writeFile(path, 'MARBLE_ENV_TEST=from-file\n', 'utf8')

    expect(loadLocalEnv(path)).toBe(true)
    expect(process.env.MARBLE_ENV_TEST).toBe('from-file')
  })

  it('lets an already-exported value win over the file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'marble-env-'))
    const path = join(dir, '.env.local')
    await writeFile(path, 'MARBLE_ENV_EXISTING=from-file\n', 'utf8')

    process.env.MARBLE_ENV_EXISTING = 'from-shell'
    loadLocalEnv(path)

    expect(process.env.MARBLE_ENV_EXISTING).toBe('from-shell')
  })

  it('returns false rather than throwing when there is no file - the CI case', () => {
    expect(loadLocalEnv(join(tmpdir(), 'definitely-not-here.env'))).toBe(false)
  })
})
