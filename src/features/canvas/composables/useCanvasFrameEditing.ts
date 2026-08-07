import { type ComputedRef, type Ref } from 'vue'
import type { EditorView } from 'prosemirror-view'
import { CANVAS_DOCUMENT_FRAME_ID, type CanvasBounds, type CanvasPoint } from '../../../core/canvas'
import type { CanvasTool } from './useCanvasToolState'

interface UseCanvasFrameEditingOptions {
  effectiveFrame: ComputedRef<CanvasBounds>
  frameCollapsed: ComputedRef<boolean>
  editingFrame: Ref<boolean>
  activeTool: Ref<CanvasTool>
  presentationActive: Ref<boolean>
  viewportPoint: (event: MouseEvent | DragEvent) => CanvasPoint | null
  select: (id: string) => void
  setFrameEditing: (editing: boolean) => void
  setFrameCollapsed: (collapsed: boolean) => void
  getEditorView: () => EditorView | null
}

/** Entering, leaving and collapsing the document frame. Built after the pointer and P1 composables, whose `select`/presentation state it acts on. */
export function useCanvasFrameEditing(options: UseCanvasFrameEditingOptions) {
  function startEditingFrame() {
    options.editingFrame.value = true
    options.setFrameEditing(true)
  }

  function finishEditing() {
    if (!options.editingFrame.value) return
    options.editingFrame.value = false
    options.setFrameEditing(false)
  }

  function enterFrameEditFromHeader() {
    options.select(CANVAS_DOCUMENT_FRAME_ID)
    startEditingFrame()
    options.getEditorView()?.focus()
  }

  function toggleFrameCollapsed() {
    // Never leave the editor "editing" while its DOM is about to go
    // `display: none` — that would strand a focused, invisible editor.
    finishEditing()
    options.setFrameCollapsed(!options.frameCollapsed.value)
  }

  function onEditorDoubleClick(event: MouseEvent) {
    if (options.presentationActive.value) return
    if (options.activeTool.value !== 'select') return
    const point = options.viewportPoint(event)
    if (!point) return
    const frame = options.effectiveFrame.value
    if (point.x < frame.x || point.x > frame.x + frame.width || point.y < frame.y || point.y > frame.y + frame.height) return
    if (options.frameCollapsed.value) {
      options.select(CANVAS_DOCUMENT_FRAME_ID)
      toggleFrameCollapsed()
      return
    }
    options.select(CANVAS_DOCUMENT_FRAME_ID)
    startEditingFrame()
    options.getEditorView()?.focus()
  }

  return {
    startEditingFrame,
    finishEditing,
    enterFrameEditFromHeader,
    toggleFrameCollapsed,
    onEditorDoubleClick,
  }
}
