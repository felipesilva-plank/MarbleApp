/**
 * Load the repo-root .env.local, if there is one.
 *
 * Three separate error messages tell the user to put their key in .env.local. Nothing was reading
 * it: vite loads it for VITE_ vars in the browser app, but a plain `tsx` process does not, so
 * following the instruction changed nothing and the same error came back.
 *
 * `process.loadEnvFile` throws when the file is absent, which is the normal case in CI - hence the
 * catch. Real values already in the environment win, because an exported key should beat a stale
 * file. Import this FIRST, before anything that reads process.env at module scope.
 */
import { fileURLToPath } from 'node:url'

const ROOT_ENV = fileURLToPath(new URL('../../../.env.local', import.meta.url))

export function loadLocalEnv(path: string = ROOT_ENV): boolean {
  const before = { ...process.env }
  try {
    process.loadEnvFile(path)
  } catch {
    return false
  }
  // loadEnvFile overwrites; restore anything that was already set explicitly.
  for (const [key, value] of Object.entries(before)) {
    if (value !== undefined) process.env[key] = value
  }
  return true
}
