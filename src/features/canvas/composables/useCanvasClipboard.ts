import type { Ref } from 'vue'
import {
  CANVAS_CLIPBOARD_MIME,
  parseCanvasClipboard,
  serializeCanvasClipboard,
  type CanvasClipboardPayload,
  type CanvasPoint,
  type CanvasSnapshotV1,
} from '../../../core/canvas'

interface CanvasClipboardActions {
  deleteCanvasItems: (ids: readonly string[]) => void
  insertClipboard: (payload: CanvasClipboardPayload, offset?: CanvasPoint) => string[]
}

interface UseCanvasClipboardOptions {
  snapshot: Ref<CanvasSnapshotV1>
  selectedIds: Ref<string[]>
  actions: CanvasClipboardActions
}

let memoryClipboard = ''

export function useCanvasClipboard(options: UseCanvasClipboardOptions) {
  function selectionPayload(): CanvasClipboardPayload | null {
    const selected = new Set(options.selectedIds.value)
    const elements = Object.values(options.snapshot.value.elements).filter(element => selected.has(element.id))
    const connectors = Object.values(options.snapshot.value.connectors).filter((connector) => {
      if (selected.has(connector.id)) return true
      const from = connector.from.binding
      const to = connector.to.binding
      return from?.target === 'element' && to?.target === 'element'
        && selected.has(from.targetId) && selected.has(to.targetId)
    })
    if (!elements.length && !connectors.length) return null
    return { version: 1, elements, connectors }
  }

  async function copy(): Promise<boolean> {
    const payload = selectionPayload()
    if (!payload) return false
    const serialized = serializeCanvasClipboard(payload)
    memoryClipboard = serialized
    try {
      const item = new ClipboardItem({
        [CANVAS_CLIPBOARD_MIME]: new Blob([serialized], { type: CANVAS_CLIPBOARD_MIME }),
        'text/plain': new Blob([serialized], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
    } catch {
      try {
        await navigator.clipboard.writeText(serialized)
      } catch {
        // The in-memory fallback preserves copy/paste inside this app session.
      }
    }
    return true
  }

  async function cut() {
    if (!await copy()) return
    options.actions.deleteCanvasItems(options.selectedIds.value)
    options.selectedIds.value = []
  }

  async function paste(): Promise<boolean> {
    let value = memoryClipboard
    try {
      value = await navigator.clipboard.readText()
    } catch {
      // Keep the in-memory fallback.
    }
    const payload = parseCanvasClipboard(value) ?? parseCanvasClipboard(memoryClipboard)
    if (!payload) return false
    const ids = options.actions.insertClipboard(payload)
    options.selectedIds.value = ids
    return ids.length > 0
  }

  function duplicate(): boolean {
    const payload = selectionPayload()
    if (!payload) return false
    const ids = options.actions.insertClipboard(payload)
    options.selectedIds.value = ids
    return ids.length > 0
  }

  return { copy, cut, paste, duplicate }
}
