import type { CreatePieceInput, Piece, PieceFilter, UpdatePieceInput } from '@marble/core'
import type { PieceRepository } from '../ports'
import { apiGet, apiSend, request, toQuery } from './client'

/**
 * Photos cross this boundary as bytes, not as base64 in JSON.
 *
 * The UI works in data URLs — that is what an `<img src>` wants and what the compression step in
 * `lib/image.ts` produces — so the conversion happens here rather than leaking either
 * representation across the seam. Upload decodes to a Blob and posts multipart, which avoids
 * inflating every image by a third and pushing it through a JSON parser. Download re-encodes to a
 * data URL rather than handing back an object URL: an object URL has to be revoked, and a grid of
 * remnant thumbnails is exactly where forgetting to do that becomes a leak.
 */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(',')
  const contentType = /:(.*?);/.exec(header)?.[1] ?? 'image/jpeg'
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: contentType })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the photo.'))
    reader.readAsDataURL(blob)
  })
}

export const httpPieceRepository: PieceRepository = {
  async list(filter: PieceFilter = {}): Promise<Piece[]> {
    const query = toQuery({
      q: filter.q,
      kind: filter.kind,
      remnantOrigin: filter.remnantOrigin,
      status: filter.status,
      materialId: filter.materialId,
      location: filter.location,
      rootId: filter.rootId,
      parentId: filter.parentId,
      minLengthMm: filter.minLengthMm,
      minWidthMm: filter.minWidthMm,
      thicknessMm: filter.thicknessMm,
      orphansOnly: filter.orphansOnly,
    })
    const { pieces } = await apiGet<{ pieces: Piece[] }>(`/api/pieces${query}`)
    return pieces
  },

  async get(id: string): Promise<Piece | null> {
    try {
      const { piece } = await apiGet<{ piece: Piece }>(`/api/pieces/${id}`)
      return piece
    } catch (error) {
      // The port's contract is "null when absent"; only a missing piece maps to that.
      if ((error as { code?: string }).code === 'NOT_FOUND') return null
      throw error
    }
  },

  async create(input: CreatePieceInput): Promise<Piece> {
    const { piece } = await apiSend<{ piece: Piece }>('/api/pieces', 'POST', input)
    return piece
  },

  async update(id: string, input: UpdatePieceInput): Promise<Piece> {
    const { piece } = await apiSend<{ piece: Piece }>(`/api/pieces/${id}`, 'PATCH', input)
    return piece
  },

  async assignParent(id: string, parentId: string | null): Promise<Piece[]> {
    const { pieces } = await apiSend<{ pieces: Piece[] }>(`/api/pieces/${id}/parent`, 'PUT', {
      parentId,
    })
    return pieces
  },

  async remove(id: string, opts: { orphanChildren?: boolean } = {}): Promise<void> {
    await apiSend(`/api/pieces/${id}${toQuery({ orphanChildren: opts.orphanChildren })}`, 'DELETE')
  },

  async setPhoto(id: string, dataUrl: string | null): Promise<void> {
    if (!dataUrl) {
      await apiSend(`/api/pieces/${id}/photo`, 'DELETE')
      return
    }
    const form = new FormData()
    form.set('photo', dataUrlToBlob(dataUrl), 'piece.jpg')
    await request(`/api/pieces/${id}/photo`, { method: 'PUT', body: form })
  },

  async getPhotoUrl(id: string): Promise<string | null> {
    try {
      const response = await request(`/api/pieces/${id}/photo`)
      return await blobToDataUrl(await response.blob())
    } catch (error) {
      if ((error as { code?: string }).code === 'NOT_FOUND') return null
      throw error
    }
  },

  async knownLocations(): Promise<string[]> {
    const { locations } = await apiGet<{ locations: string[] }>('/api/pieces/locations')
    return locations
  },
}
