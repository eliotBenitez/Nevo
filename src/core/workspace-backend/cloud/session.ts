// A single live Yjs document session against the relay, used by the cloud
// backend for the manifest document and (transiently) for note content I/O.
// Reuses the existing E2E CloudProvider (AES-GCM with the storage DEK).
//
// The session is also the local-durability boundary: it rehydrates its document
// from the offline cache before the first read and writes it back as the
// document changes, so edits made with no relay reachable survive the app being
// closed and merge on the next connect.

import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { CloudProvider } from '../../../editor-core/collaboration/cloudProvider'
import { encryptBytes, decryptBytes } from '../../../editor-core/collaboration/encryption'
import { nullOfflineCache, type OfflineDocCache } from './offlineCache'

/** Transactions written locally carry this origin so the manifest observer can
 *  distinguish our own writes from remote peers' updates. */
export const CLOUD_LOCAL_ORIGIN = Symbol('cloud-local-origin')

/** Applied state restored from the offline cache. Deliberately *not*
 *  CLOUD_LOCAL_ORIGIN: the manifest observer must react to it, because offline
 *  this is the only content the UI will ever get. */
export const CLOUD_CACHE_ORIGIN = Symbol('cloud-cache-origin')

/** Debounce for cache writes: long enough to coalesce a burst of keystrokes,
 *  short enough that a crash loses at most this much work. */
const CACHE_WRITE_DELAY_MS = 1000

export interface CloudSessionOptions {
  roomCode: string
  key: CryptoKey
  /** Resolved before every connect and reconnect: the relay authorizes the
   *  access token once at WS upgrade, so a session that outlives the token's
   *  15-minute lifetime must present a freshly refreshed one. */
  getToken: () => Promise<string | null>
  wsBase: string
  /** Local durability for offline edits. Defaults to no caching. */
  cache?: OfflineDocCache
  /** Reports that a relay message could not be decrypted — the session is
   *  degraded and will not compact the relay's state. */
  onIntegrityError?: () => void
}

export class CloudSession {
  readonly ydoc: Y.Doc
  readonly awareness: Awareness
  private readonly provider: CloudProvider
  private readonly cache: OfflineDocCache
  private readonly roomCode: string
  private readonly key: CryptoKey
  private readonly hydrated: Promise<void>
  private _synced = false
  private _destroyed = false
  private _syncWaiters: Array<() => void> = []
  private _cacheTimer: ReturnType<typeof setTimeout> | null = null
  private _updateHandler: (update: Uint8Array, origin: unknown) => void

  constructor(opts: CloudSessionOptions) {
    this.ydoc = new Y.Doc()
    this.awareness = new Awareness(this.ydoc)
    this.cache = opts.cache ?? nullOfflineCache
    this.roomCode = opts.roomCode
    this.key = opts.key

    // Start rehydrating immediately, before the socket: offline, the cache is
    // the only source of content, and whenSynced() gates on this.
    this.hydrated = this._hydrate()

    this._updateHandler = (_update, origin) => {
      // Cache-origin updates are what we just read back — re-saving them would
      // rewrite an identical blob on every open.
      if (origin === CLOUD_CACHE_ORIGIN) return
      this._scheduleCacheWrite()
    }
    this.ydoc.on('update', this._updateHandler)

    this.provider = new CloudProvider({
      ydoc: this.ydoc,
      awareness: this.awareness,
      wsUrl: async () => {
        const token = await opts.getToken()
        return `${opts.wsBase}/ws/${opts.roomCode}?token=${encodeURIComponent(token ?? '')}`
      },
      key: opts.key,
      onIntegrityError: opts.onIntegrityError,
      onStatusChange: (s) => {
        // `degraded` is a completed sync too — the document is usable, just
        // known-incomplete — so waiters must not hang until the timeout.
        if ((s === 'connected' || s === 'degraded') && !this._synced) {
          this._synced = true
          this._syncWaiters.splice(0).forEach((resolve) => resolve())
        }
      },
    })
  }

  private async _hydrate(): Promise<void> {
    try {
      const stored = await this.cache.load(this.roomCode)
      if (!stored || this._destroyed) return
      const update = await decryptBytes(this.key, stored)
      if (this._destroyed) return
      Y.applyUpdate(this.ydoc, update, CLOUD_CACHE_ORIGIN)
    } catch {
      // An unreadable cache entry (rotated DEK, truncated write) is not fatal:
      // the relay still has the document. Drop it so it stops being retried.
      await this.cache.remove(this.roomCode).catch(() => {})
    }
  }

  private _scheduleCacheWrite(): void {
    if (this._destroyed || this._cacheTimer) return
    this._cacheTimer = setTimeout(() => {
      this._cacheTimer = null
      void this._writeCache()
    }, CACHE_WRITE_DELAY_MS)
  }

  private async _writeCache(): Promise<void> {
    try {
      const state = Y.encodeStateAsUpdate(this.ydoc)
      const encrypted = await encryptBytes(this.key, state)
      await this.cache.save(this.roomCode, encrypted)
    } catch { /* best-effort */ }
  }

  /** True once the relay actually answered. `whenSynced` also resolves on its
   *  timeout, so anything that must not mistake "never arrived" for "empty"
   *  has to check this. */
  get synced(): boolean {
    return this._synced
  }

  /** True only after a complete, decryptable relay sync. A timeout or degraded
   *  sync must never be treated as proof that an empty document is new. */
  get hasCompleteRelayState(): boolean {
    return this.provider.status === 'connected'
  }

  /**
   * Resolves once the document is usable: the offline cache has been applied
   * and either the relay's state arrived or the timeout elapsed. Offline, this
   * still yields the cached content rather than an empty document.
   */
  async whenSynced(timeoutMs = 8000): Promise<void> {
    await this.hydrated
    if (this._synced) return
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs) // resolve anyway so the UI never hangs
      this._syncWaiters.push(() => { clearTimeout(t); resolve() })
    })
  }

  /** Persists the current state to the offline cache without waiting for the
   *  debounce — used on teardown so the last edits are never dropped. */
  flushCache(): Promise<void> {
    if (this._cacheTimer) {
      clearTimeout(this._cacheTimer)
      this._cacheTimer = null
    }
    return this._writeCache()
  }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    if (this._cacheTimer) {
      clearTimeout(this._cacheTimer)
      this._cacheTimer = null
    }
    // Encode the final state before the doc is destroyed; the write itself may
    // complete after teardown, which is fine — the cache is keyed by room.
    const finalState = Y.encodeStateAsUpdate(this.ydoc)
    void encryptBytes(this.key, finalState)
      .then(encrypted => this.cache.save(this.roomCode, encrypted))
      .catch(() => {})

    this.ydoc.off('update', this._updateHandler)
    this.provider.destroy()
    this.ydoc.destroy()
  }
}
