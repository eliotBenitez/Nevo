import * as Y from 'yjs'
import * as awarenessProtocol from 'y-protocols/awareness'
import type { Awareness } from 'y-protocols/awareness'
import { encryptBytes, decryptBytes } from './encryption'

const MSG_SYNC_DONE  = 0x00
const MSG_FULL_STATE = 0x01
const MSG_UPDATE     = 0x02
const MSG_AWARENESS  = 0x03

export type CloudProviderStatus = 'connecting' | 'syncing' | 'connected' | 'disconnected' | 'error'

export interface CloudProviderOptions {
  ydoc: Y.Doc
  awareness: Awareness
  wsUrl: string
  key: CryptoKey
  onStatusChange?: (status: CloudProviderStatus) => void
}

export class CloudProvider {
  private _ydoc: Y.Doc
  private _awareness: Awareness
  private _key: CryptoKey
  private _wsUrl: string
  private _ws: WebSocket | null = null
  private _status: CloudProviderStatus = 'connecting'
  private _onStatusChange?: (status: CloudProviderStatus) => void
  private _destroyed = false
  private _retryTimer: ReturnType<typeof setTimeout> | null = null
  private _retryDelay = 1000
  private _synced = false
  private _pendingSyncDone = false
  private _inflightDecrypt = 0

  private _docHandler: (update: Uint8Array, origin: unknown) => void
  private _awarenessHandler: (arg: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => void

  constructor(options: CloudProviderOptions) {
    this._ydoc = options.ydoc
    this._awareness = options.awareness
    this._key = options.key
    this._wsUrl = options.wsUrl
    this._onStatusChange = options.onStatusChange

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
    this._connect()
  }

  private _setStatus(s: CloudProviderStatus): void {
    if (this._status === s) return
    this._status = s
    this._onStatusChange?.(s)
  }

  private _connect(): void {
    if (this._destroyed) return
    this._setStatus('connecting')
    this._synced = false

    let ws: WebSocket
    try {
      ws = new WebSocket(this._wsUrl)
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
          this._sendMsg(MSG_FULL_STATE, Y.encodeStateAsUpdate(this._ydoc))
          this._setStatus('connected')
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
        // wrong key or corrupted — silently skip
      } finally {
        this._inflightDecrypt--
        if (this._pendingSyncDone && this._inflightDecrypt === 0) {
          this._pendingSyncDone = false
          this._sendMsg(MSG_FULL_STATE, Y.encodeStateAsUpdate(this._ydoc))
          this._setStatus('connected')
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

  private _scheduleReconnect(): void {
    if (this._destroyed) return
    this._retryTimer = setTimeout(() => this._connect(), this._retryDelay)
    this._retryDelay = Math.min(this._retryDelay * 2, 30_000)
  }

  private _sendMsg(type: number, payload: Uint8Array): void {
    void this._encryptAndSend(type, payload)
  }

  private async _encryptAndSend(type: number, payload: Uint8Array): Promise<void> {
    if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return
    const encrypted = await encryptBytes(this._key, payload)
    const msg = new Uint8Array(1 + encrypted.length)
    msg[0] = type
    msg.set(encrypted, 1)
    this._ws.send(msg)
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
