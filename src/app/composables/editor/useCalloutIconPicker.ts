import { nextTick, reactive } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { ClampOverlayPosition } from './editorPopoverPosition'

export interface CalloutIconPickerState {
  open: boolean
  value: string
  nodePos: number | null
  position: { top: number; left: number }
}

interface CalloutIconPickerRefs {
  getCalloutIconPickerEl: () => HTMLElement | null
}

/** Callout block icon picker extracted from WorkspaceEditorPane. */
export function useCalloutIconPicker(
  core: EditorCore,
  refs: CalloutIconPickerRefs,
  clampOverlayPosition: ClampOverlayPosition,
) {
  const calloutIconPicker = reactive<CalloutIconPickerState>({
    open: false,
    value: '💡',
    nodePos: null,
    position: { top: 0, left: 0 },
  })

  function openCalloutIconPicker(pos: number, rect: DOMRect, icon: string) {
    calloutIconPicker.open = true
    calloutIconPicker.nodePos = pos
    calloutIconPicker.value = icon
    calloutIconPicker.position = { top: rect.bottom + 8, left: rect.left }

    void nextTick(() => {
      const pickerEl = refs.getCalloutIconPickerEl()?.firstElementChild as HTMLElement | null
      if (!calloutIconPicker.open || !pickerEl) return
      calloutIconPicker.position = clampOverlayPosition(calloutIconPicker.position, pickerEl)
    })
  }

  function closeCalloutIconPicker() {
    calloutIconPicker.open = false
    calloutIconPicker.nodePos = null
  }

  function selectCalloutIcon(icon: string) {
    const view = core.editorView
    const pos = calloutIconPicker.nodePos
    if (!view || pos === null) return

    const node = view.state.doc.nodeAt(pos)
    if (!node || node.type !== view.state.schema.nodes.callout) return

    calloutIconPicker.value = icon
    view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, icon }).scrollIntoView())
    view.focus()
    closeCalloutIconPicker()
  }

  return { calloutIconPicker, openCalloutIconPicker, closeCalloutIconPicker, selectCalloutIcon }
}
