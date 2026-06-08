import { NodeSelection } from 'prosemirror-state'
import { nextTick, watch } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { MarkmapPopoverState } from './useEditorOverlays'
import { getEditorOverlayBoundaryRect, placeEditorPopoverNearAnchor, type ClampOverlayPosition } from './editorPopoverPosition'

export function useMarkmapEditor(
  core: EditorCore,
  markmapPopover: MarkmapPopoverState,
  refs: {
    getMarkmapPopoverEl: () => HTMLElement | null
    onFocusInput: () => void
  },
  onOverlaysUpdate: () => void,
  clampOverlayPosition: ClampOverlayPosition,
) {
  function getMarkmapAnchorRect(position: number, fallbackRect?: DOMRect) {
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

  function placeMarkmapPopover(el: HTMLElement, anchorRect: DOMRect) {
    markmapPopover.position = placeEditorPopoverNearAnchor(
      el,
      anchorRect,
      clampOverlayPosition,
      getEditorOverlayBoundaryRect(core),
    )
  }

  function repositionMarkmapPopover(anchorRect?: DOMRect) {
    if (!markmapPopover.open) return
    const nodePos = markmapPopover.nodePos
    if (typeof nodePos !== 'number') return

    const wrapperEl = refs.getMarkmapPopoverEl()
    const el = (wrapperEl?.firstElementChild as HTMLElement | null) ?? wrapperEl
    if (!el) return

    const rect = getMarkmapAnchorRect(nodePos, anchorRect)
    if (!rect) return
    placeMarkmapPopover(el, rect)
  }

  function openMarkmapPopoverForNode(position: number, anchorRect?: DOMRect) {
    if (!core.editorView) return
    const node = core.editorView.state.doc.nodeAt(position)
    if (!node || node.type.name !== 'markmap_block') return

    const rect = getMarkmapAnchorRect(position, anchorRect)
    if (!rect) return

    markmapPopover.open = true
    markmapPopover.nodePos = position
    markmapPopover.markdown = typeof node.attrs.markdown === 'string' ? node.attrs.markdown : ''
    markmapPopover.position = { top: rect.bottom + 12, left: rect.left + rect.width / 2 }

    nextTick(() => {
      repositionMarkmapPopover(rect)
      refs.onFocusInput()
    })
  }

  function closeMarkmapPopover() {
    markmapPopover.open = false
    markmapPopover.nodePos = null
  }

  function applyMarkmapFromPopover() {
    if (!core.editorView) return
    const nodePos = markmapPopover.nodePos
    if (typeof nodePos !== 'number') return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node || node.type.name !== 'markmap_block') return

    const tr = core.editorView.state.tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, markdown: markmapPopover.markdown })
    core.editorView.dispatch(tr.setSelection(NodeSelection.create(tr.doc, nodePos)).scrollIntoView())
    closeMarkmapPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function removeMarkmapFromPopover() {
    if (!core.editorView) return
    const nodePos = markmapPopover.nodePos
    if (typeof nodePos !== 'number') return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node || node.type.name !== 'markmap_block') return

    core.editorView.dispatch(core.editorView.state.tr.delete(nodePos, nodePos + node.nodeSize).scrollIntoView())
    closeMarkmapPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function onMarkmapInputKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMarkmapPopover()
      core.editorView?.focus()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      applyMarkmapFromPopover()
    }
  }

  watch(
    () => [markmapPopover.open, markmapPopover.markdown] as const,
    async ([open]) => {
      if (!open) return
      await nextTick()
      repositionMarkmapPopover()
    },
  )

  return {
    openMarkmapPopoverForNode,
    closeMarkmapPopover,
    applyMarkmapFromPopover,
    removeMarkmapFromPopover,
    onMarkmapInputKeyDown,
    repositionMarkmapPopover,
  }
}
