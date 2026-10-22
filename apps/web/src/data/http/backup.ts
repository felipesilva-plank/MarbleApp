import { DomainError } from '@marble/core'
import type { BackupPort } from '../ports'
import { apiGet, apiSend } from './client'

/**
 * Export is the honest answer to "can we leave?", and a subscription product that cannot answer
 * it does not deserve the subscription. It is also how a shop that trialled the browser-only MVP
 * arrives with its stone intact — the server accepts that older format too.
 */
export const httpBackupPort: BackupPort = {
  async exportAll(): Promise<string> {
    return JSON.stringify(await apiGet<unknown>('/api/backup'), null, 2)
  },

  async importAll(json: string): Promise<{ pieces: number; materials: number }> {
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      // Caught here rather than at the server: a file that is not JSON never needs a round trip.
      throw new DomainError('BAD_BACKUP', 'That file is not valid JSON.')
    }
    return apiSend<{ pieces: number; materials: number }>('/api/backup', 'POST', parsed)
  },
}
