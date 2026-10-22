import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import { DomainError } from '@marble/core'
import { env } from '../env.ts'

/**
 * Where piece photos live.
 *
 * Photo bytes are deliberately not a column. A shop that cuts six slabs a day photographs most of
 * what comes off them, which is hundreds of megabytes a year of data that is never queried, only
 * fetched by key — exactly the thing object storage is for and exactly the thing that makes a
 * Postgres backup slow and expensive.
 *
 * Two implementations behind one interface: Supabase Storage when it is configured, the local
 * filesystem when it is not. The filesystem one exists so that `npm run dev` and the test suite
 * need no cloud credentials at all — not as a production fallback.
 */
export interface StoredPhoto {
  bytes: Uint8Array
  contentType: string
}

export interface PhotoStore {
  put(orgId: string, pieceId: string, bytes: Uint8Array, contentType: string): Promise<void>
  get(orgId: string, pieceId: string): Promise<StoredPhoto | null>
  remove(orgId: string, pieceId: string): Promise<void>
}

/** Keys are org-scoped so a misdirected read cannot cross a tenant boundary. */
function key(orgId: string, pieceId: string): string {
  return `${orgId}/${pieceId}`
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export const ALLOWED_PHOTO_TYPES = Object.keys(EXTENSIONS)

/** 8 MB. A phone photo compressed by the browser lands near 200 KB; this is a hostile-input cap. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024

export function assertUploadable(contentType: string, byteLength: number): void {
  if (!EXTENSIONS[contentType]) {
    throw new DomainError('VALIDATION', 'Photos must be a JPEG, PNG or WebP image.')
  }
  if (byteLength > MAX_PHOTO_BYTES) {
    throw new DomainError('QUOTA', 'That photo is larger than 8 MB. Take it again at a lower size.')
  }
}

// --- filesystem -------------------------------------------------------------

function fsStore(root: string): PhotoStore {
  // The content type is not recoverable from bytes alone, so it is written beside them.
  const paths = (orgId: string, pieceId: string) => {
    const base = resolve(root, key(orgId, pieceId))
    return { bin: `${base}.bin`, meta: `${base}.type` }
  }

  return {
    async put(orgId, pieceId, bytes, contentType) {
      const { bin, meta } = paths(orgId, pieceId)
      await mkdir(dirname(bin), { recursive: true })
      await writeFile(bin, bytes)
      await writeFile(meta, contentType, 'utf8')
    },
    async get(orgId, pieceId) {
      const { bin, meta } = paths(orgId, pieceId)
      try {
        const [bytes, contentType] = await Promise.all([readFile(bin), readFile(meta, 'utf8')])
        return { bytes: new Uint8Array(bytes), contentType: contentType.trim() }
      } catch {
        return null
      }
    },
    async remove(orgId, pieceId) {
      const { bin, meta } = paths(orgId, pieceId)
      await Promise.all([rm(bin, { force: true }), rm(meta, { force: true })])
    },
  }
}

// --- Supabase Storage -------------------------------------------------------

function supabaseStore(client: SupabaseClient, bucket: string): PhotoStore {
  return {
    async put(orgId, pieceId, bytes, contentType) {
      const { error } = await client.storage
        .from(bucket)
        .upload(key(orgId, pieceId), bytes, { contentType, upsert: true })
      if (error) throw new Error(`Could not store the photo: ${error.message}`)
    },
    async get(orgId, pieceId) {
      const { data, error } = await client.storage.from(bucket).download(key(orgId, pieceId))
      if (error || !data) return null
      return { bytes: new Uint8Array(await data.arrayBuffer()), contentType: data.type }
    },
    async remove(orgId, pieceId) {
      // Removing something that is not there is not an error worth propagating.
      await client.storage.from(bucket).remove([key(orgId, pieceId)])
    },
  }
}

let cached: PhotoStore | null = null

export function photoStore(): PhotoStore {
  if (cached) return cached
  const config = env()

  if (config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY) {
    // The service-role key bypasses row-level security, which is correct here and would be a
    // catastrophe in the browser. It is read from a non-VITE_ variable for exactly that reason.
    const client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
    cached = supabaseStore(client, config.SUPABASE_PHOTO_BUCKET)
  } else {
    cached = fsStore(join(process.cwd(), config.PHOTO_DIR))
  }
  return cached
}

/** Test hook. */
export function setPhotoStore(store: PhotoStore | null): void {
  cached = store
}
