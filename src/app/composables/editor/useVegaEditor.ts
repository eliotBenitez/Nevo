import { NodeSelection } from 'prosemirror-state'
import { nextTick, watch } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { VegaPopoverState } from './useEditorOverlays'
import { getEditorOverlayBoundaryRect, placeEditorPopoverNearAnchor, type ClampOverlayPosition } from './editorPopoverPosition'

export function useVegaEditor(
  core: EditorCore,
  vegaPopover: VegaPopoverState,
  refs: {
    getVegaPopoverEl: () => HTMLElement | null
    onFocusInput: () => void
  },
  onOverlaysUpdate: () => void,
  clampOverlayPosition: ClampOverlayPosition,
) {
  function getVegaAnchorRect(position: number, fallbackRect?: DOMRect) {
    if (fallbackRect) return fallbackRect
    if (!core.editorView) return null

    const nodeDom = core.editorView.nodeDOM(position)
    if (nodeDom instanceof HTMLElement) {
      return nodeDom.getBoundingClientRect()
    }

    const fallback = core.editorView.coordsAtPos(position)
    return new DOMRect(
      fallback.left,
      fallback.top,
      Math.max(fallback.right - fallback.left, 1),
      Math.max(fallback.bottom - fallback.top, 1),
    )
  }

  function placeVegaPopover(el: HTMLElement, anchorRect: DOMRect) {
    vegaPopover.position = placeEditorPopoverNearAnchor(
      el,
      anchorRect,
      clampOverlayPosition,
      getEditorOverlayBoundaryRect(core),
    )
  }

  function repositionVegaPopover(anchorRect?: DOMRect) {
    if (!vegaPopover.open) return
    const nodePos = vegaPopover.nodePos
    if (typeof nodePos !== 'number') return

    const wrapperEl = refs.getVegaPopoverEl()
    const el = (wrapperEl?.firstElementChild as HTMLElement | null) ?? wrapperEl
    if (!el) return

    const rect = getVegaAnchorRect(nodePos, anchorRect)
    if (!rect) return
    placeVegaPopover(el, rect)
  }

  function openVegaPopoverForNode(position: number, anchorRect?: DOMRect) {
    if (!core.editorView) return
    const node = core.editorView.state.doc.nodeAt(position)
    if (!node || node.type.name !== 'vega_block') return

    const rect = getVegaAnchorRect(position, anchorRect)
    if (!rect) return

    vegaPopover.open = true
    vegaPopover.nodePos = position
    vegaPopover.spec = typeof node.attrs.spec === 'string' ? node.attrs.spec : '{}'
    vegaPopover.position = { top: rect.bottom + 12, left: rect.left + rect.width / 2 }

    nextTick(() => {
      repositionVegaPopover(rect)
      refs.onFocusInput()
    })
  }

  function closeVegaPopover() {
    vegaPopover.open = false
    vegaPopover.nodePos = null
  }

  function applyVegaFromPopover() {
    if (!core.editorView) return
    const nodePos = vegaPopover.nodePos
    if (typeof nodePos !== 'number') return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node || node.type.name !== 'vega_block') return

    const tr = core.editorView.state.tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, spec: vegaPopover.spec })
    core.editorView.dispatch(tr.setSelection(NodeSelection.create(tr.doc, nodePos)).scrollIntoView())
    closeVegaPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function removeVegaFromPopover() {
    if (!core.editorView) return
    const nodePos = vegaPopover.nodePos
    if (typeof nodePos !== 'number') return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node || node.type.name !== 'vega_block') return

    core.editorView.dispatch(core.editorView.state.tr.delete(nodePos, nodePos + node.nodeSize).scrollIntoView())
    closeVegaPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function onVegaInputKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeVegaPopover()
      core.editorView?.focus()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      applyVegaFromPopover()
    }
  }

  watch(
    () => [vegaPopover.open, vegaPopover.spec] as const,
    async ([open]) => {
      if (!open) return
      await nextTick()
      repositionVegaPopover()
    },
  )

  return {
    openVegaPopoverForNode,
    closeVegaPopover,
    applyVegaFromPopover,
    removeVegaFromPopover,
    onVegaInputKeyDown,
    repositionVegaPopover,
  }
}
