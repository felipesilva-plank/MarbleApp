import { httpAuthPort } from './http/authRepo'
import { httpBackupPort } from './http/backup'
import { httpMaterialRepository } from './http/materialRepo'
import { httpPieceRepository } from './http/pieceRepo'
import { httpPresetRepository } from './http/presetRepo'
import type {
  AuthPort,
  BackupPort,
  MaterialRepository,
  PieceRepository,
  PresetRepository,
} from './ports'

/**
 * The adapter selection point.
 *
 * There is exactly one implementation now: everything goes to `apps/api` over HTTP. The seam
 * still earns its place — this file is what made replacing the browser-only storage layer a
 * change to `data/` and nothing above it. Not one hook, route or component was touched.
 */

export const pieces: PieceRepository = httpPieceRepository
export const materials: MaterialRepository = httpMaterialRepository
export const presets: PresetRepository = httpPresetRepository
export const auth: AuthPort = httpAuthPort
export const backup: BackupPort = httpBackupPort

export { API_URL } from './http/client'
export * from './errors'
export type * from './ports'
