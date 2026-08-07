import { NodeSelection } from 'prosemirror-state'
import { nextTick, watch } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { QueryPopoverState } from './useEditorOverlays'
import { normalizeQueryBlockData } from '../../../features/query/queryBlockData'
import { getEditorOverlayBoundaryRect, placeEditorPopoverNearAnchor, type ClampOverlayPosition } from './editorPopoverPosition'

export function useQueryEditor(
  core: EditorCore,
  queryPopover: QueryPopoverState,
  refs: {
    getQueryPopoverEl: () => HTMLElement | null
  },
  onOverlaysUpdate: () => void,
  clampOverlayPosition: ClampOverlayPosition,
) {
  let activeAnchorRect: DOMRect | null = null

  function getQueryAnchorRect(position: number, fallbackRect?: DOMRect) {
    if (fallbackRect) return fallbackRect
    if (activeAnchorRect) return activeAnchorRect
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

  function placeQueryPopover(el: HTMLElement, anchorRect: DOMRect) {
    queryPopover.position = placeEditorPopoverNearAnchor(
      el,
      anchorRect,
      clampOverlayPosition,
      getEditorOverlayBoundaryRect(core),
    )
  }

  function repositionQueryPopover(anchorRect?: DOMRect) {
    if (!queryPopover.open) return
    const nodePos = queryPopover.nodePos
    if (typeof nodePos !== 'number') return

    const wrapperEl = refs.getQueryPopoverEl()
    const el = (wrapperEl?.firstElementChild as HTMLElement | null) ?? wrapperEl
    if (!el) return

    const rect = getQueryAnchorRect(nodePos, anchorRect)
    if (!rect) return
    placeQueryPopover(el, rect)
  }

  function openQueryPopoverForNode(position: number, anchorRect?: DOMRect) {
    if (!core.editorView) return
    const node = core.editorView.state.doc.nodeAt(position)
    if (!node || node.type.name !== 'query_block') return

    const rect = getQueryAnchorRect(position, anchorRect)
    if (!rect) return

    activeAnchorRect = rect
    queryPopover.open = true
    queryPopover.nodePos = position
    queryPopover.data = normalizeQueryBlockData(node.attrs.data)
    queryPopover.position = { top: rect.bottom + 12, left: rect.left + rect.width / 2 }

    nextTick(() => {
      repositionQueryPopover(rect)
    })
  }

  function closeQueryPopover() {
    queryPopover.open = false
    queryPopover.nodePos = null
    activeAnchorRect = null
  }

  function applyQueryFromPopover() {
    if (!core.editorView) return
    const nodePos = queryPopover.nodePos
    if (typeof nodePos !== 'number') return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node || node.type.name !== 'query_block') return

    const tr = core.editorView.state.tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, data: queryPopover.data })
    core.editorView.dispatch(tr.setSelection(NodeSelection.create(tr.doc, nodePos)).scrollIntoView())
    closeQueryPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function removeQueryFromPopover() {
    if (!core.editorView) return
    const nodePos = queryPopover.nodePos
    if (typeof nodePos !== 'number') return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node || node.type.name !== 'query_block') return

    core.editorView.dispatch(core.editorView.state.tr.delete(nodePos, nodePos + node.nodeSize).scrollIntoView())
    closeQueryPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function onQueryInputKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeQueryPopover()
      core.editorView?.focus()
    }
  }

  watch(
    () => [queryPopover.open, queryPopover.data] as const,
    async ([open]) => {
      if (!open) return
      await nextTick()
      repositionQueryPopover()
    },
  )

  return {
    openQueryPopoverForNode,
    closeQueryPopover,
    applyQueryFromPopover,
    removeQueryFromPopover,
    onQueryInputKeyDown,
    repositionQueryPopover,
  }
}
