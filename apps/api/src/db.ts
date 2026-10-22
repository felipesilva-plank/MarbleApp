import { PrismaClient } from '@prisma/client'

/**
 * One client for the process. Prisma owns a connection pool, and constructing a second client
 * doubles the pool against a database whose connection limit is the scarcest thing about it —
 * especially on a serverless-adjacent host where instances already multiply.
 */
let client: PrismaClient | null = null

export function db(): PrismaClient {
  if (!client) client = new PrismaClient()
  return client
}

export async function disconnect(): Promise<void> {
  await client?.$disconnect()
  client = null
}

/** Prisma's own error shape, narrowed. Used to turn a unique-violation into a DomainError. */
export function isUniqueViolation(error: unknown, target?: string): boolean {
  const code = (error as { code?: string } | null)?.code
  if (code !== 'P2002') return false
  if (!target) return true
  const meta = (error as { meta?: { target?: string[] | string } }).meta?.target
  const fields = Array.isArray(meta) ? meta : typeof meta === 'string' ? [meta] : []
  return fields.some((field) => field.includes(target))
}
