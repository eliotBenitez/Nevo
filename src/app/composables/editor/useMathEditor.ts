import { NodeSelection } from 'prosemirror-state'
import { nextTick, watch } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { MathPopoverState } from './useEditorOverlays'
import { getEditorOverlayBoundaryRect, placeEditorPopoverNearAnchor, type ClampOverlayPosition } from './editorPopoverPosition'

export function useMathEditor(
  core: EditorCore,
  mathPopover: MathPopoverState,
  refs: {
    getMathPopoverEl: () => HTMLElement | null
    onFocusInput: () => void
  },
  onOverlaysUpdate: () => void,
  clampOverlayPosition: ClampOverlayPosition,
) {
  function getMathAnchorRect(position: number, fallbackRect?: DOMRect) {
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

  function placeMathPopover(el: HTMLElement, anchorRect: DOMRect) {
    mathPopover.position = placeEditorPopoverNearAnchor(
      el,
      anchorRect,
      clampOverlayPosition,
      getEditorOverlayBoundaryRect(core),
    )
  }

  function repositionMathPopover(anchorRect?: DOMRect) {
    if (!mathPopover.open) return
    const nodePos = mathPopover.nodePos
    if (typeof nodePos !== 'number') return

    const wrapperEl = refs.getMathPopoverEl()
    const el = (wrapperEl?.firstElementChild as HTMLElement | null) ?? wrapperEl
    if (!el) return

    const rect = getMathAnchorRect(nodePos, anchorRect)
    if (!rect) return
    placeMathPopover(el, rect)
  }

  function getSelectedMathNode() {
    if (!core.editorView) return null
    const { selection } = core.editorView.state
    if (!(selection instanceof NodeSelection)) return null
    const node = selection.node
    if (node.type.name !== 'math_inline' && node.type.name !== 'math_block') return null
    return { position: selection.from, node, isInline: node.type.name === 'math_inline' }
  }

  function openMathPopoverForNode(position: number, anchorRect?: DOMRect) {
    if (!core.editorView) return
    const node = core.editorView.state.doc.nodeAt(position)
    if (!node || (node.type.name !== 'math_inline' && node.type.name !== 'math_block')) return

    const rect = getMathAnchorRect(position, anchorRect)
    if (!rect) return

    mathPopover.open = true
    mathPopover.nodePos = position
    mathPopover.latex = typeof node.attrs.latex === 'string' ? node.attrs.latex : ''
    mathPopover.isInline = node.type.name === 'math_inline'
    mathPopover.position = { top: rect.bottom + 12, left: rect.left + rect.width / 2 }

    nextTick(() => {
      repositionMathPopover(rect)
      refs.onFocusInput()
    })
  }

  function closeMathPopover() {
    mathPopover.open = false
    mathPopover.nodePos = null
  }

  function openSelectedMathPopover(): boolean {
    const selected = getSelectedMathNode()
    if (!selected) return false
    openMathPopoverForNode(selected.position)
    return true
  }

  function insertInlineMathAndEdit(): boolean {
    if (!core.coreCommands) return false
    const selected = getSelectedMathNode()
    if (selected?.isInline) {
      openMathPopoverForNode(selected.position)
      return true
    }
    if (!core.editorView) return false
    const applied = core.coreCommands.insertMathInline('')(core.editorView.state, core.editorView.dispatch.bind(core.editorView))
    if (applied) {
      core.editorView.focus()
      onOverlaysUpdate()
      openSelectedMathPopover()
    }
    return applied
  }

  function insertBlockMathAndEdit(): boolean {
    if (!core.coreCommands || !core.editorView) return false
    const applied = core.coreCommands.insertMathBlock('')(core.editorView.state, core.editorView.dispatch.bind(core.editorView))
    if (applied) {
      core.editorView.focus()
      onOverlaysUpdate()
      openSelectedMathPopover()
    }
    return applied
  }

  function applyMathFromPopover() {
    if (!core.editorView || !core.coreCommands) return
    const nodePos = mathPopover.nodePos
    if (typeof nodePos !== 'number') return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node || (node.type.name !== 'math_inline' && node.type.name !== 'math_block')) return

    const tr = core.editorView.state.tr.setNodeMarkup(nodePos, undefined, { ...node.attrs, latex: mathPopover.latex })
    core.editorView.dispatch(tr.setSelection(NodeSelection.create(tr.doc, nodePos)).scrollIntoView())
    closeMathPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function removeMathFromPopover() {
    if (!core.editorView) return
    const nodePos = mathPopover.nodePos
    if (typeof nodePos !== 'number') return
    const node = core.editorView.state.doc.nodeAt(nodePos)
    if (!node || (node.type.name !== 'math_inline' && node.type.name !== 'math_block')) return

    core.editorView.dispatch(core.editorView.state.tr.delete(nodePos, nodePos + node.nodeSize).scrollIntoView())
    closeMathPopover()
    core.editorView.focus()
    onOverlaysUpdate()
  }

  function onMathInputKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeMathPopover()
      core.editorView?.focus()
      return
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      applyMathFromPopover()
    }
  }

  watch(
    () => [mathPopover.open, mathPopover.latex] as const,
    async ([open]) => {
      if (!open) return
      await nextTick()
      repositionMathPopover()
    },
  )

  return {
    openMathPopoverForNode,
    closeMathPopover,
    openSelectedMathPopover,
    insertInlineMathAndEdit,
    insertBlockMathAndEdit,
    applyMathFromPopover,
    removeMathFromPopover,
    onMathInputKeyDown,
    repositionMathPopover,
  }
}
