import { afterAll, beforeEach } from 'vitest'
import { db, disconnect } from '../db.ts'
import { setPhotoStore } from '../photos/store.ts'
import { setEnv } from '../env.ts'

// globalSetup already wrote DATABASE_URL; this is the fallback for a worker that starts without it.
process.env.DATABASE_URL ??= `postgresql://${process.env.USER ?? 'postgres'}@localhost:5432/marble_test`
process.env.NODE_ENV = 'test'
process.env.WEB_ORIGIN = 'http://localhost:5173'

beforeEach(async () => {
  setEnv(null)
  setPhotoStore(null)
  // One statement, so foreign keys never come into it. RESTART IDENTITY is harmless here (every
  // key is a uuid) and keeps the reset honest if a serial column is ever added.
  await db().$executeRawUnsafe(
    'TRUNCATE TABLE pieces, materials, filter_presets, code_counters, sessions, users, orgs RESTART IDENTITY CASCADE',
  )
})

afterAll(async () => {
  await disconnect()
})
