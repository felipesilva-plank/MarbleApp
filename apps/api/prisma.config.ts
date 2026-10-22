import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

/**
 * Prisma 7 reads its configuration from here rather than from package.json, and having a config
 * file switches off Prisma's own dotenv loading — so `.env` is loaded explicitly.
 *
 * It must not overwrite a DATABASE_URL that is already set. The test suite points Prisma at a
 * throwaway database by exporting one, and clobbering it with the value in `.env` would have
 * `migrate deploy` — and then the suite's TRUNCATE — run against the development database.
 */
const envFile = new URL('.env', import.meta.url).pathname
if (!process.env.DATABASE_URL && existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'node --experimental-strip-types src/seed.ts',
  },
})
