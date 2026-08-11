/**
 * Photos live in IndexedDB, not localStorage.
 *
 * localStorage caps at roughly 5 MB per origin. Remnant photos run 100-200 KB each even after
 * compression, so a couple of dozen would exhaust the quota and then throw QuotaExceededError
 * in the middle of an unrelated save. IndexedDB gives us hundreds of MB and keeps the record
 * store small and fast to parse on every read.
 *
 * Values are stored as data URL strings rather than Blobs: no object URLs to revoke (a real leak
 * source in a photo grid), and backup export is a straight copy.
 */

const DB_NAME = 'marble'
const DB_VERSION = 1
const STORE = 'photos'

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error ?? new Error('Could not open the photo store'))
    })
  }
  return dbPromise
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode)
        const request = fn(transaction.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Photo store request failed'))
      }),
  )
}

export async function putPhoto(pieceId: string, dataUrl: string): Promise<void> {
  await run('readwrite', (store) => store.put(dataUrl, pieceId))
}

export async function getPhoto(pieceId: string): Promise<string | null> {
  const value = await run<string | undefined>('readonly', (store) => store.get(pieceId))
  return value ?? null
}

export async function deletePhoto(pieceId: string): Promise<void> {
  await run('readwrite', (store) => store.delete(pieceId))
}

/** Every photo, keyed by piece id. Used by backup export. */
export async function allPhotos(): Promise<Record<string, string>> {
  const keys = await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys())
  const values = await run<string[]>('readonly', (store) => store.getAll())

  const out: Record<string, string> = {}
  keys.forEach((key, index) => {
    const value = values[index]
    if (typeof key === 'string' && typeof value === 'string') out[key] = value
  })
  return out
}

export async function clearPhotos(): Promise<void> {
  await run('readwrite', (store) => store.clear())
}

export async function replaceAllPhotos(photos: Record<string, string>): Promise<void> {
  await clearPhotos()
  for (const [pieceId, dataUrl] of Object.entries(photos)) {
    await putPhoto(pieceId, dataUrl)
  }
}
