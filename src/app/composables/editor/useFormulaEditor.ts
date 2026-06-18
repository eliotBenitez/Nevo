import { TextSelection } from 'prosemirror-state'
import { nextTick, watch } from 'vue'
import type { EditorCore } from './useEditorCore'
import type { FormulaPopoverState } from './useEditorOverlays'
import { getEditorOverlayBoundaryRect, placeEditorPopoverNearAnchor, type ClampOverlayPosition } from './editorPopoverPosition'

function isCellNode(name: string): boolean {
  return name === 'table_cell' || name === 'table_header'
}

export function useFormulaEditor(
  core: EditorCore,
  formulaPopover: FormulaPopoverState,
  refs: {
    getFormulaPopoverEl: () => HTMLElement | null
    onFocusInput: () => void
  },
  onOverlaysUpdate: () => void,
  clampOverlayPosition: ClampOverlayPosition,
) {
  function getCellAnchorRect(cellPos: number, fallbackRect?: DOMRect) {
    if (fallbackRect) return fallbackRect
    if (!core.editorView) return null

    const nodeDom = core.editorView.nodeDOM(cellPos)
    if (nodeDom instanceof HTMLElement) return nodeDom.getBoundingClientRect()

    const fallback = core.editorView.coordsAtPos(cellPos)
    return new DOMRect(
      fallback.left,
      fallback.top,
      Math.max(fallback.right - fallback.left, 1),
      Math.max(fallback.bottom - fallback.top, 1),
    )
  }

  function placeFormulaPopover(el: HTMLElement, anchorRect: DOMRect) {
    formulaPopover.position = placeEditorPopoverNearAnchor(
      el,
      anchorRect,
      clampOverlayPosition,
      getEditorOverlayBoundaryRect(core),
    )
  }

  function repositionFormulaPopover(anchorRect?: DOMRect) {
    if (!formulaPopover.open) return
    const cellPos = formulaPopover.cellPos
    if (typeof cellPos !== 'number') return

    const wrapperEl = refs.getFormulaPopoverEl()
    const el = (wrapperEl?.firstElementChild as HTMLElement | null) ?? wrapperEl
    if (!el) return

    const rect = getCellAnchorRect(cellPos, anchorRect)
    if (!rect) return
    placeFormulaPopover(el, rect)
  }

  function openFormulaPopoverForCell(cellPos: number, anchorRect?: DOMRect) {
    if (!core.editorView) return
    const cell = core.editorView.state.doc.nodeAt(cellPos)
    if (!cell || !isCellNode(cell.type.name)) return

    const rect = getCellAnchorRect(cellPos, anchorRect)
    if (!rect) return

    formulaPopover.open = true
    formulaPopover.cellPos = cellPos
    formulaPopover.formula = typeof cell.attrs.formula === 'string' ? cell.attrs.formula : ''
    formulaPopover.position = { top: rect.bottom + 12, left: rect.left + rect.width / 2 }

    nextTick(() => {
      repositionFormulaPopover(rect)
      refs.onFocusInput()
    })
  }

  function closeFormulaPopover() {
    formulaPopover.open = false
    formulaPopover.cellPos = null
  }

  function applyFormulaFromPopover() {
    if (!core.editorView || !core.coreCommands) return
    const cellPos = formulaPopover.cellPos
    if (typeof cellPos !== 'number') return
    const view = core.editorView
    const cell = view.state.doc.nodeAt(cellPos)
    if (!cell || !isCellNode(cell.type.name)) return

    // Move the selection inside the target cell so the formula command resolves it.
    const selection = TextSelection.create(view.state.doc, cellPos + 1)
    view.dispatch(view.state.tr.setSelection(selection))
    core.coreCommands.setTableCellFormula(formulaPopover.formula)(view.state, view.dispatch.bind(view))

    closeFormulaPopover()
    view.focus()
    onOverlaysUpdate()
  }

  function removeFormulaFromPopover() {
    if (!core.editorView || !core.coreCommands) return
    const cellPos = formulaPopover.cellPos
    if (typeof cellPos !== 'number') return
    const view = core.editorView
    const cell = view.state.doc.nodeAt(cellPos)
    if (!cell || !isCellNode(cell.type.name)) return

    const selection = TextSelection.create(view.state.doc, cellPos + 1)
    view.dispatch(view.state.tr.setSelection(selection))
    core.coreCommands.setTableCellFormula(null)(view.state, view.dispatch.bind(view))

    closeFormulaPopover()
    view.focus()
    onOverlaysUpdate()
  }

  function onFormulaInputKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      closeFormulaPopover()
      core.editorView?.focus()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      applyFormulaFromPopover()
    }
  }

  watch(
    () => [formulaPopover.open, formulaPopover.formula] as const,
    async ([open]) => {
      if (!open) return
      await nextTick()
      repositionFormulaPopover()
    },
  )

  return {
    openFormulaPopoverForCell,
    closeFormulaPopover,
    applyFormulaFromPopover,
    removeFormulaFromPopover,
    onFormulaInputKeyDown,
    repositionFormulaPopover,
  }
}
