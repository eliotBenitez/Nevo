import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import type { Awareness } from 'y-protocols/awareness'

export interface YWebSocketProviderOptions {
  ydoc: Y.Doc
  noteId: string
  wsUrl: string
  awareness?: Awareness
  onStatusChange?: (status: 'connecting' | 'connected' | 'disconnected') => void
}

export function createWebSocketProvider(options: YWebSocketProviderOptions): WebsocketProvider {
  const roomName = `note-${options.noteId}`
  const provider = new WebsocketProvider(options.wsUrl, roomName, options.ydoc, {
    connect: true,
    ...(options.awareness ? { awareness: options.awareness } : {}),
    maxBackoffTime: 5000,
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
