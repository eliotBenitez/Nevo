import { onBeforeUnmount, onMounted, type ComputedRef, type Ref } from 'vue'
import type { EditorView } from 'prosemirror-view'
import { CANVAS_DOCUMENT_FRAME_ID, type CanvasBounds, type CanvasCamera, type CanvasPoint } from '../../../core/canvas'
import type { CanvasTool } from './useCanvasToolState'

interface CanvasKeyboardItem {
  id: string
  kind: 'frame' | 'element' | 'elements'
  bounds: CanvasBounds
}

interface CanvasKeyboardActions {
  moveFrame: (x: number, y: number) => void
  moveElement: (id: string, x: number, y: number) => void
  moveElements: (ids: readonly string[], delta: CanvasPoint) => void
  updateElements: (patches: Readonly<Record<string, Partial<CanvasBounds>>>) => void
  deleteCanvasItem: (id: string) => boolean
  undo: () => void
  redo: () => void
}

interface UseCanvasKeyboardOptions {
  spacePressed: Ref<boolean>
  camera: CanvasCamera
  viewportSize: CanvasPoint
  selectedIds: Ref<string[]>
  selectedItem: ComputedRef<CanvasKeyboardItem | null>
  editingFrame: Ref<boolean>
  editingCanvasText: Ref<string>
  frameCollapsed: Ref<boolean>
  actions: CanvasKeyboardActions
  getEditorView: () => EditorView | null
  startEditingFrame: () => void
  finishEditing: () => void
  cancelCanvasText: () => void
  editSelected: () => void
  cancelGesture: () => void
  toggleFrameCollapsed: () => void
  fitAll: () => void
  zoomAt: (point: CanvasPoint, zoom: number) => void
  activateTool: (tool: CanvasTool) => void
  copy: () => Promise<boolean>
  cut: () => Promise<void>
  paste: () => Promise<boolean>
  duplicate: () => boolean
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'))
}

export function useCanvasKeyboard(options: UseCanvasKeyboardOptions) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented) return
    const modifier = event.ctrlKey || event.metaKey
    if (isEditableTarget(event.target)) {
      if (event.key === 'Escape' && options.editingFrame.value) options.finishEditing()
      return
    }
    if (event.code === 'Space') {
      options.spacePressed.value = true
      event.preventDefault()
      return
    }
    if (modifier && event.code === 'KeyZ') {
      if (event.shiftKey) options.actions.redo()
      else options.actions.undo()
      event.preventDefault()
      return
    }
    if (modifier && event.code === 'KeyC') {
      void options.copy()
      event.preventDefault()
      return
    }
    if (modifier && event.code === 'KeyX') {
      void options.cut()
      event.preventDefault()
      return
    }
    if (modifier && event.code === 'KeyV') {
      void options.paste()
      event.preventDefault()
      return
    }
    if (modifier && event.code === 'KeyD') {
      options.duplicate()
      event.preventDefault()
      return
    }
    if (!modifier && !event.altKey) {
      const shortcut: Partial<Record<string, CanvasTool>> = {
        KeyV: 'select',
        KeyH: 'hand',
        KeyT: 'text',
        KeyR: 'rectangle',
        KeyO: 'ellipse',
        KeyD: 'diamond',
        KeyC: 'connector',
        KeyP: 'pen',
        KeyM: 'highlighter',
        KeyE: 'eraser',
        KeyI: 'image',
      }
      const tool = shortcut[event.code]
      if (tool) {
        options.activateTool(tool)
        event.preventDefault()
        return
      }
    }
    if (event.key === 'Escape') {
      options.cancelGesture()
      if (options.editingCanvasText.value) options.cancelCanvasText()
      else if (options.editingFrame.value) options.finishEditing()
      else options.selectedIds.value = []
      event.preventDefault()
      return
    }
    if (event.key === 'Enter') {
      if (options.selectedIds.value.includes(CANVAS_DOCUMENT_FRAME_ID)) {
        if (options.frameCollapsed.value) options.toggleFrameCollapsed()
        else {
          options.startEditingFrame()
          options.getEditorView()?.focus()
        }
      } else {
        options.editSelected()
      }
      event.preventDefault()
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && options.selectedIds.value.length) {
      for (const id of options.selectedIds.value) {
        if (id !== CANVAS_DOCUMENT_FRAME_ID) options.actions.deleteCanvasItem(id)
      }
      options.selectedIds.value = []
      event.preventDefault()
      return
    }
    if (event.key === '+' || event.key === '=') {
      options.zoomAt({ x: options.viewportSize.x / 2, y: options.viewportSize.y / 2 }, options.camera.zoom * 1.15)
      event.preventDefault()
    } else if (event.key === '-') {
      options.zoomAt({ x: options.viewportSize.x / 2, y: options.viewportSize.y / 2 }, options.camera.zoom / 1.15)
      event.preventDefault()
    } else if (event.key === '0') {
      options.fitAll()
      event.preventDefault()
    } else if (options.selectedItem.value && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      const item = options.selectedItem.value
      const step = event.shiftKey ? 10 : 1
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      if (item.kind === 'frame') options.actions.moveFrame(item.bounds.x + dx, item.bounds.y + dy)
      else if (item.kind === 'element') options.actions.moveElement(item.id, item.bounds.x + dx, item.bounds.y + dy)
      else options.actions.moveElements(options.selectedIds.value, { x: dx, y: dy })
      event.preventDefault()
    }
  }

  function onKeyUp(event: KeyboardEvent) {
    if (event.code === 'Space') options.spacePressed.value = false
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  })
}
