import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { Awareness } from 'y-protocols/awareness'

export interface YWebSocketProviderOptions {
  ydoc: Y.Doc
  noteId: string
  wsUrl: string
  sessionToken: string
  awareness?: Awareness
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void
}

// Marker subprotocol the collab relay echoes back on a successful handshake.
// The session token is offered as a second subprotocol so it travels in the
// `Sec-WebSocket-Protocol` header rather than the URL query (which can leak into
// logs). Must match `COLLAB_SUBPROTOCOL` in `src-tauri/src/collab/server.rs`.
const COLLAB_SUBPROTOCOL = 'nevo-collab-v1'

export function createWebSocketProvider(options: YWebSocketProviderOptions): WebsocketProvider {
  const roomName = `note-${options.noteId}`
  const provider = new WebsocketProvider(options.wsUrl, roomName, options.ydoc, {
    connect: true,
    ...(options.awareness ? { awareness: options.awareness } : {}),
    maxBackoffTime: 5000,
    protocols: [COLLAB_SUBPROTOCOL, options.sessionToken],
  })

  if (options.onStatusChange) {
    const cb = options.onStatusChange
    provider.on('status', ({ status }: { status: string }) => {
      if (status === 'connecting') cb('connecting')
      else if (status === 'connected') cb('connected')
      else cb('disconnected')
    })
  }

  return provider
}

export function destroyWebSocketProvider(provider: WebsocketProvider): void {
  provider.disconnect()
  provider.destroy()
}
