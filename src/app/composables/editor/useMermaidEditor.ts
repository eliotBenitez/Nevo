import { NodeSelection } from 'prosemirror-state'
import { nextTick, watch } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { MermaidPopoverState } from './useEditorOverlays'
import { getEditorOverlayBoundaryRect, placeEditorPopoverNearAnchor, type ClampOverlayPosition } from './editorPopoverPosition'

export function useMermaidEditor(
  core: EditorCore,
  mermaidPopover: MermaidPopoverState,
  refs: {
    getMermaidPopoverEl: () => HTMLElement | null
    onFocusInput: () => void
  },
  onOverlaysUpdate: () => void,
  clampOverlayPosition: ClampOverlayPosition,
) {
  function getMermaidAnchorRect(position: number, fallbackRect?: DOMRect) {
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

  function placeMermaidPopover(el: HTMLElement, anchorRect: DOMRect) {
    mermaidPopover.position = placeEditorPopoverNearAnchor(
      el,
      anchorRect,
      clampOverlayPosition,
      getEditorOverlayBoundaryRect(core),
    )
  }

  function repositionMermaidPopover(anchorRect?: DOMRect) {
    if (!mermaidPopover.open) return
    const nodePos = mermaidPopover.nodePos
    if (typeof nodePos !== 'number') return

    const wrapperEl = refs.getMermaidPopoverEl()
    const el = (wrapperEl?.firstElementChild as HTMLElement | null) ?? wrapperEl
    if (!el) return

    const rect = getMermaidAnchorRect(nodePos, anchorRect)
    if (!rect) return
    placeMermaidPopover(el, rect)
  }

  function openMermaidPopoverForNode(position: number, anchorRect?: DOMRect) {
    if (!core.editorView) return
    const node = core.editorView.state.doc.nodeAt(position)
    if (!node || node.type.name !== 'mermaid_block') return

    const rect = getMermaidAnchorRect(position, anchorRect)
    if (!rect) return

    mermaidPopover.open = true
    mermaidPopover.nodePos = position
    mermaidPopover.code = typeof node.attrs.code === 'string' ? node.attrs.code : ''
    mermaidPopover.position = { top: rect.bottom + 12, left: rect.left + rect.width / 2 }

    nextTick(() => {
      repositionMermaidPopover(rect)
      refs.onFocusInput()
    })
  }

  function closeMermaidPopover() {
    mermaidPopover.open = false
    mermaidPopover.nodePos = null
  }

  function applyMermaidFromPopover() {
    if (!core.editorView) return
    const nodePos = mermaidPopover.nodePos
    if (typeof nodePos !== 'number') return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node || node.type.name !== 'mermaid_block') return

    const tr = core.editorView.state.tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, code: mermaidPopover.code })
    core.editorView.dispatch(tr.setSelection(NodeSelection.create(tr.doc, nodePos)).scrollIntoView())
    closeMermaidPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function removeMermaidFromPopover() {
    if (!core.editorView) return
    const nodePos = mermaidPopover.nodePos
    if (typeof nodePos !== 'number') return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node || node.type.name !== 'mermaid_block') return

    core.editorView.dispatch(core.editorView.state.tr.delete(nodePos, nodePos + node.nodeSize).scrollIntoView())
    closeMermaidPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function onMermaidInputKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMermaidPopover()
      core.editorView?.focus()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      applyMermaidFromPopover()
    }
  }

  watch(
    () => [mermaidPopover.open, mermaidPopover.code] as const,
    async ([open]) => {
      if (!open) return
      await nextTick()
      repositionMermaidPopover()
    },
  )

  return {
    openMermaidPopoverForNode,
    closeMermaidPopover,
    applyMermaidFromPopover,
    removeMermaidFromPopover,
    onMermaidInputKeyDown,
    repositionMermaidPopover,
  }
}
