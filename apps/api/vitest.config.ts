import { defineConfig } from 'vitest/config'

/**
 * The API test suite talks to a real Postgres. There is no in-memory substitute here on purpose:
 * unique constraints, enum columns, `onDelete: Restrict` on the lineage relation and transaction
 * rollback are a large share of what this layer *is*, and a fake would assert none of it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./src/test/globalSetup.ts'],
    setupFiles: ['./src/test/setup.ts'],
    // Every file drives one database. Running them in parallel would have one file truncating
    // tables between another's insert and the assertion about it.
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
    // scrypt is deliberately slow, and a registration runs it for real in several tests.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      '@marble/core': new URL('../../packages/core/src/index.ts', import.meta.url).pathname,
    },
  },
})
