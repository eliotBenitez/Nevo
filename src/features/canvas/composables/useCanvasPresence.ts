import { onBeforeUnmount, shallowRef } from 'vue'
import type { Awareness } from 'y-protocols/awareness'
import type { CanvasPoint } from '../../../core/canvas'

export interface CanvasPresenceState {
  noteId: string
  cursor?: CanvasPoint
  selection: string[]
}

export function useCanvasPresence(
  noteId: string,
  getAwareness: () => Awareness | null,
) {
  const peers = shallowRef<Array<{ clientId: number; state: CanvasPresenceState }>>([])
  let awareness: Awareness | null = null
  let lastCursorUpdate = 0

  const refresh = () => {
    if (!awareness) return
    const next: Array<{ clientId: number; state: CanvasPresenceState }> = []
    for (const [clientId, value] of awareness.getStates()) {
      if (clientId === awareness.clientID) continue
      const canvas = value.canvas as CanvasPresenceState | undefined
      if (canvas?.noteId === noteId) next.push({ clientId, state: canvas })
    }
    peers.value = next
  }

  function connect() {
    awareness = getAwareness()
    if (!awareness) return
    awareness.on('change', refresh)
    refresh()
  }

  function publish(selection: readonly string[], cursor?: CanvasPoint) {
    if (!awareness) connect()
    if (!awareness) return
    awareness.setLocalStateField('canvas', {
      noteId,
      selection: [...selection],
      ...(cursor ? { cursor } : {}),
    } satisfies CanvasPresenceState)
  }

  function publishCursor(selection: readonly string[], cursor: CanvasPoint) {
    const now = performance.now()
    if (now - lastCursorUpdate < 40) return
    lastCursorUpdate = now
    publish(selection, cursor)
  }

  function clear() {
    awareness?.setLocalStateField('canvas', null)
  }

  onBeforeUnmount(() => {
    clear()
    awareness?.off('change', refresh)
  })

  return { peers, connect, publish, publishCursor, clear }
}
