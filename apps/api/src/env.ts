import { z } from 'zod'

/**
 * Every environment variable the server reads, parsed once at boot.
 *
 * A missing DATABASE_URL should kill the process on startup with a sentence a human can act on,
 * not surface as a connection error inside the first request that happens to touch the database.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — see .env.example'),
  PORT: z.coerce.number().int().positive().default(3001),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * Comma-separated origins allowed to send credentialed requests. The web app and the API are
   * deployed separately and therefore cross-origin, so this cannot be left as `*` — a wildcard
   * is rejected outright by browsers once `credentials: include` is in play, and would be a
   * session-theft hole if it were not.
   */
  WEB_ORIGIN: z.string().default('http://localhost:5173'),

  /** Object storage for piece photos. Absent → the on-disk store, which is enough for dev. */
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_PHOTO_BUCKET: z.string().default('piece-photos'),
  /** Where the filesystem photo store writes. Only used when Supabase is not configured. */
  PHOTO_DIR: z.string().default('.data/photos'),

  SESSION_DAYS: z.coerce.number().int().positive().default(7),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source)
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid environment:\n${lines.join('\n')}`)
  }
  return result.data
}

export function env(): Env {
  if (!cached) cached = loadEnv()
  return cached
}

/** Test hook. Production never calls this. */
export function setEnv(value: Env | null): void {
  cached = value
}

export function allowedOrigins(value = env().WEB_ORIGIN): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
}
