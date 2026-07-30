import { localAuthPort } from './local/authRepo'
import { localBackupPort } from './local/backup'
import { localMaterialRepository } from './local/materialRepo'
import { localPieceRepository } from './local/pieceRepo'
import { seedIfEmpty } from './local/seed'
import type { AuthPort, BackupPort, MaterialRepository, PieceRepository } from './ports'

/**
 * The adapter selection point. Migrating to the Fastify API is this file and nothing else:
 *
 *   export const pieces: PieceRepository = httpPieceRepository
 *
 * Nothing above this layer — hooks, routes, components — imports from ./local, so nothing above
 * it needs to change.
 */

export const pieces: PieceRepository = localPieceRepository
export const materials: MaterialRepository = localMaterialRepository
export const auth: AuthPort = localAuthPort
export const backup: BackupPort = localBackupPort

/** Local-adapter-only bootstrap; becomes a no-op once data lives on a server. */
export function initData(): void {
  seedIfEmpty()
}

export * from './errors'
export type * from './ports'
