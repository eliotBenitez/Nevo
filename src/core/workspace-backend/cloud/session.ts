// A single live Yjs document session against the relay, used by the cloud
// backend for the manifest document and (transiently) for note content I/O.
// Reuses the existing E2E CloudProvider (AES-GCM with the storage DEK).

import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { CloudProvider } from '../../../editor-core/collaboration/cloudProvider'

/** Transactions written locally carry this origin so the manifest observer can
 *  distinguish our own writes from remote peers' updates. */
export const CLOUD_LOCAL_ORIGIN = Symbol('cloud-local-origin')

export interface CloudSessionOptions {
  roomCode: string
  key: CryptoKey
  token: string
  wsBase: string
}

export class CloudSession {
  readonly ydoc: Y.Doc
  readonly awareness: Awareness
  private readonly provider: CloudProvider
  private _synced = false
  private _syncWaiters: Array<() => void> = []

  constructor(opts: CloudSessionOptions) {
    this.ydoc = new Y.Doc()
    this.awareness = new Awareness(this.ydoc)
    const wsUrl = `${opts.wsBase}/ws/${opts.roomCode}?token=${encodeURIComponent(opts.token)}`
    this.provider = new CloudProvider({
      ydoc: this.ydoc,
      awareness: this.awareness,
      wsUrl,
      key: opts.key,
      onStatusChange: (s) => {
        if (s === 'connected' && !this._synced) {
          this._synced = true
          this._syncWaiters.splice(0).forEach((resolve) => resolve())
        }
      },
    })
  }

  /** Resolves once the initial state has been received from the relay. */
  whenSynced(timeoutMs = 8000): Promise<void> {
    if (this._synced) return Promise.resolve()
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs) // resolve anyway so the UI never hangs
      this._syncWaiters.push(() => { clearTimeout(t); resolve() })
    })
  }

  destroy(): void {
    this.provider.destroy()
    this.ydoc.destroy()
  }
}
