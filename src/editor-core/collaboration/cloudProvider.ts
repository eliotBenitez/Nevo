import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'
import type { Awareness } from 'y-protocols/awareness'
import { encryptBytes, decryptBytes } from './encryption'

const MSG_SYNC_DONE  = 0x00
const MSG_FULL_STATE = 0x01
const MSG_UPDATE     = 0x02
const MSG_AWARENESS  = 0x03

/**
 * `degraded` means: synced, but at least one message from the relay could not
 * be decrypted, so the local document is knowingly incomplete. Editing still
 * works (local updates are additive at the relay) but this client must never
 * push a full state — that would replace the server's copy with one missing
 * the content it failed to read.
 */
export type CloudProviderStatus = 'connecting' | 'syncing' | 'connected' | 'degraded' | 'disconnected' | 'error'

/** A fixed URL, or a factory resolved before every (re)connect. Use the factory
 *  form whenever the URL carries a credential that can expire — the relay only
 *  authorizes at upgrade time, so a reconnect must present a fresh token. */
export type CloudProviderUrl = string | (() => string | Promise<string>)

export interface CloudProviderOptions {
  ydoc: Y.Doc
  awareness: Awareness
  wsUrl: CloudProviderUrl
  key: CryptoKey
  onStatusChange?: (status: CloudProviderStatus) => void
  /** Called once per connection when a relay message fails to decrypt. The
   *  session is degraded from that point; the host should surface/log it. */
  onIntegrityError?: () => void
}

export class CloudProvider {
  private _ydoc: Y.Doc
  private _awareness: Awareness
  private _key: CryptoKey
  private _wsUrl: CloudProviderUrl
  private _ws: WebSocket | null = null
  private _status: CloudProviderStatus = 'connecting'
  private _onStatusChange?: (status: CloudProviderStatus) => void
  private _onIntegrityError?: () => void
  private _destroyed = false
  private _retryTimer: ReturnType<typeof setTimeout> | null = null
  private _retryDelay = 1000
  private _synced = false
  private _pendingSyncDone = false
  private _inflightDecrypt = 0
  // Set when a relay message could not be decrypted on the current connection.
  // Reset per connect: a later connection replays the same history and may
  // read it cleanly, at which point pushing a full state is safe again.
  private _decryptFailed = false

  private _docHandler: (update: Uint8Array, origin: unknown) => void
  private _awarenessHandler: (arg: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void

  constructor(options: CloudProviderOptions) {
    this._ydoc = options.ydoc
    this._awareness = options.awareness
    this._key = options.key
    this._wsUrl = options.wsUrl
    this._onStatusChange = options.onStatusChange
    this._onIntegrityError = options.onIntegrityError

    this._docHandler = (update, origin) => {
      if (origin === this) return
      if (!this._synced) return
      this._sendMsg(MSG_UPDATE, update)
    }

    this._awarenessHandler = ({ added, updated, removed }, origin) => {
      if (origin === this) return
      const clients = [...added, ...updated, ...removed]
      const enc = awarenessProtocol.encodeAwarenessUpdate(this._awareness, clients)
      this._sendMsg(MSG_AWARENESS, enc)
    }

    this._ydoc.on('update', this._docHandler)
    this._awareness.on('update', this._awarenessHandler)
    void this._connect()
  }

  private _setStatus(s: CloudProviderStatus): void {
    if (this._status === s) return
    this._status = s
    this._onStatusChange?.(s)
  }

  private async _connect(): Promise<void> {
    if (this._destroyed) return
    this._setStatus('connecting')
    this._synced = false
    this._decryptFailed = false

    let url: string
    try {
      url = typeof this._wsUrl === 'string' ? this._wsUrl : await this._wsUrl()
    } catch {
      // Could not mint a URL (e.g. the token refresh failed): retry with backoff
      // rather than giving up, so the session recovers once auth does.
      this._setStatus('error')
      this._scheduleReconnect()
      return
    }
    // The awaited factory above yields to the event loop; destroy() may have run.
    if (this._destroyed) return

    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch {
      this._setStatus('error')
      this._scheduleReconnect()
      return
    }
    ws.binaryType = 'arraybuffer'
    this._ws = ws

    ws.onopen = () => {
      this._retryDelay = 1000
      this._setStatus('syncing')
      const states = this._awareness.getStates()
      if (states.size > 0) {
        const enc = awarenessProtocol.encodeAwarenessUpdate(this._awareness, Array.from(states.keys()))
        this._sendMsg(MSG_AWARENESS, enc)
      }
    }

    ws.onmessage = async (e: MessageEvent<ArrayBuffer>) => {
      const data = new Uint8Array(e.data)
      if (data.length < 1) return
      const type = data[0]

      if (type === MSG_SYNC_DONE) {
        this._synced = true
        if (this._inflightDecrypt > 0) {
          this._pendingSyncDone = true
        } else {
          this._finishSync()
        }
        return
      }

      const payload = data.slice(1)
      this._inflightDecrypt++
      try {
        const plain = await decryptBytes(this._key, payload)
        if (type === MSG_FULL_STATE || type === MSG_UPDATE) {
          Y.applyUpdate(this._ydoc, plain, this)
        } else if (type === MSG_AWARENESS) {
          awarenessProtocol.applyAwarenessUpdate(this._awareness, plain, this)
        }
      } catch {
        // Wrong key, corrupted blob, or a message written by a peer holding a
        // different DEK. The content is unreadable, so it is missing from our
        // document — remember that, because a full-state push from an
        // incomplete document would delete it from the relay for everyone.
        this._decryptFailed = true
        this._onIntegrityError?.()
      } finally {
        this._inflightDecrypt--
        if (this._pendingSyncDone && this._inflightDecrypt === 0) {
          this._pendingSyncDone = false
          this._finishSync()
        }
      }
    }

    ws.onclose = () => {
      this._ws = null
      if (!this._destroyed) {
        this._setStatus('disconnected')
        this._scheduleReconnect()
      }
    }

    ws.onerror = () => {
      this._setStatus('error')
    }
  }

  /**
   * Completes the initial sync for a connection.
   *
   * Either way the local state goes up — that is how edits made while offline
   * reach the relay — but the *message type* differs, and it matters:
   *
   *  - MSG_FULL_STATE tells the relay to replace its stored state and drop
   *    every accumulated update (this is what compacts the log). Safe only from
   *    a document that holds everything the relay sent us.
   *  - MSG_UPDATE is appended. A full-state encoding is itself a valid Yjs
   *    update, so a degraded connection sends the same bytes this way: the
   *    relay merges them and nothing it already had can be lost.
   */
  private _finishSync(): void {
    const state = Y.encodeStateAsUpdate(this._ydoc)
    if (this._decryptFailed) {
      this._sendMsg(MSG_UPDATE, state)
      this._setStatus('degraded')
      return
    }
    this._sendMsg(MSG_FULL_STATE, state)
    this._setStatus('connected')
  }

  private _scheduleReconnect(): void {
    if (this._destroyed) return
    this._retryTimer = setTimeout(() => void this._connect(), this._retryDelay)
    this._retryDelay = Math.min(this._retryDelay * 2, 30_000)
  }

  private _sendMsg(type: number, payload: Uint8Array): void {
    void this._encryptAndSend(type, payload)
  }

  private async _encryptAndSend(type: number, payload: Uint8Array): Promise<void> {
    const ws = this._ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return
    const encrypted = await encryptBytes(this._key, payload)
    // Encryption yields to the event loop: by now the session may have been
    // destroyed, or reconnected onto a different socket. Re-check against the
    // exact socket we validated — this runs detached, so a throw here would
    // surface as an unhandled rejection.
    if (this._destroyed || this._ws !== ws || ws.readyState !== WebSocket.OPEN) return
    const msg = new Uint8Array(1 + encrypted.length)
    msg[0] = type
    msg.set(encrypted, 1)
    try {
      ws.send(msg)
    } catch { /* socket closed between the check and the send */ }
  }

  get status(): CloudProviderStatus { return this._status }

  destroy(): void {
    if (this._destroyed) return
    this._destroyed = true
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null }
    this._ydoc.off('update', this._docHandler)
    this._awareness.off('update', this._awarenessHandler)
    awarenessProtocol.removeAwarenessStates(this._awareness, [this._ydoc.clientID], this)
    if (this._ws) { this._ws.close(); this._ws = null }
    this._setStatus('disconnected')
  }
}
