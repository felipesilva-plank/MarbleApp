import { execFileSync } from 'node:child_process'

/**
 * Points the suite at a throwaway database and brings its schema up to date before any test runs.
 *
 * `TEST_DATABASE_URL` lets CI hand over its own service container; locally it falls back to a
 * `marble_test` database on the default Postgres. It is deliberately never `marble_dev` — the
 * suite truncates every table between tests.
 */
export default function setup(): void {
  // The local default assumes Postgres trusts the OS user, which is how Postgres.app and a
  // Homebrew install both behave. CI overrides it with TEST_DATABASE_URL.
  const localUser = process.env.USER ?? 'postgres'
  const url =
    process.env.TEST_DATABASE_URL ?? `postgresql://${localUser}@localhost:5432/marble_test`
  process.env.DATABASE_URL = url
  process.env.NODE_ENV = 'test'

  try {
    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: new URL('../..', import.meta.url).pathname,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Could not prepare the test database at ${url}.\n` +
        'Start Postgres and create it with:  createdb marble_test\n' +
        `Or point TEST_DATABASE_URL somewhere else.\n\n${detail}`,
    )
  }
}
