// Local durability for cloud documents.
//
// A cloud workspace's Y.Docs used to live only in RAM: edits made while the
// relay was unreachable died with the document when the app closed. This caches
// each room's CRDT state locally so a session can be rehydrated offline and its
// pending edits merge into the relay on the next successful connect.
//
// The cached bytes are the *same ciphertext discipline* as the wire: encryption
// is the caller's job (CloudSession encrypts with the storage DEK before
// calling save), so nothing readable is written to disk. This cache must never
// be handed plaintext.

export interface OfflineDocCache {
  load(roomCode: string): Promise<Uint8Array | null>
  save(roomCode: string, encrypted: Uint8Array): Promise<void>
  remove(roomCode: string): Promise<void>
  /** Drops entries untouched for longer than `maxAgeMs`. */
  prune(maxAgeMs: number): Promise<void>
}

/** Used when IndexedDB is unavailable (tests, non-browser hosts). */
export const nullOfflineCache: OfflineDocCache = {
  load: () => Promise.resolve(null),
  save: () => Promise.resolve(),
  remove: () => Promise.resolve(),
  prune: () => Promise.resolve(),
}

const DB_NAME = 'nevo-cloud-offline'
const DB_VERSION = 1
const STORE = 'docs'
const UPDATED_AT_INDEX = 'updatedAt'

interface CachedDoc {
  roomCode: string
  bytes: ArrayBuffer
  updatedAt: number
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'roomCode' })
        store.createIndex(UPDATED_AT_INDEX, UPDATED_AT_INDEX)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked'))
  })
}

/**
 * IndexedDB-backed cache. Every operation is best-effort: a browser that denies
 * storage, a corrupted database, or a quota error degrades to "no cache" rather
 * than breaking the session, because the relay remains the source of truth.
 */
export function createIndexedDbCache(): OfflineDocCache {
  let dbPromise: Promise<IDBDatabase> | null = null

  function db(): Promise<IDBDatabase> {
    if (!dbPromise) {
      dbPromise = openDatabase().catch((error) => {
        dbPromise = null // let a later call retry
        throw error
      })
    }
    return dbPromise
  }

  async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const database = await db()
    const tx = database.transaction(STORE, mode)
    const result = await run(tx.objectStore(STORE))
    if (mode === 'readwrite') {
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    }
    return result
  }

  return {
    async load(roomCode) {
      try {
        const row = await withStore('readonly', store => promisify<CachedDoc | undefined>(store.get(roomCode)))
        return row ? new Uint8Array(row.bytes) : null
      } catch {
        return null
      }
    },

    async save(roomCode, encrypted) {
      try {
        // Copy into a standalone ArrayBuffer: the source may be a view over a
        // larger, reused buffer, which would persist unrelated bytes.
        const bytes = encrypted.slice().buffer
        await withStore('readwrite', async (store) => {
          await promisify(store.put({ roomCode, bytes, updatedAt: Date.now() } satisfies CachedDoc))
        })
      } catch { /* cache is best-effort */ }
    },

    async remove(roomCode) {
      try {
        await withStore('readwrite', async (store) => { await promisify(store.delete(roomCode)) })
      } catch { /* cache is best-effort */ }
    },

    async prune(maxAgeMs) {
      try {
        const cutoff = Date.now() - maxAgeMs
        await withStore('readwrite', async (store) => {
          const stale = await promisify<IDBValidKey[]>(
            store.index(UPDATED_AT_INDEX).getAllKeys(IDBKeyRange.upperBound(cutoff)),
          )
          for (const key of stale) await promisify(store.delete(key as IDBValidKey))
        })
      } catch { /* cache is best-effort */ }
    },
  }
}

/** The IndexedDB cache when the host provides one, otherwise a no-op. */
export function resolveOfflineCache(): OfflineDocCache {
  return typeof indexedDB === 'undefined' ? nullOfflineCache : createIndexedDbCache()
}
