import { ref } from 'vue'
import type { Ref } from 'vue'
import type { NotebookViewport } from './useNotebookViewport'
import type { NotebookDocumentSession } from './useNotebookDocument'
import type { NotebookInput } from './useNotebookInput'
import type { NotebookInputTool } from './useNotebookInput'

export interface NotebookInteraction {
  isPanning: Ref<boolean>
  touchPointerIds(): number[]
  onPointerDown(event: PointerEvent): void
  onPointerMove(event: PointerEvent): void
  onPointerUp(event: PointerEvent): void
  onPointerCancel(event: PointerEvent): void
  onPagePointerDown(pageId: string, event: PointerEvent): void
  onPagePointerMove(event: PointerEvent): void
  onPagePointerUp(event: PointerEvent): void
  onPagePointerCancel(event: PointerEvent): void
  onPageLostCapture(event: PointerEvent): void
  onScroll(event: Event): void
  onWheel(event: WheelEvent): void
  onKeyDown(event: KeyboardEvent): void
  onKeyUp(event: KeyboardEvent): void
  finishBeforeCommand(): void
}

export function useNotebookInteraction(options: {
  input: NotebookInput
  viewport: NotebookViewport
  scroller: Ref<HTMLElement | null>
  tool: Ref<NotebookInputTool | 'hand'>
  activePageId: Ref<string | null>
  document: NotebookDocumentSession
  isOverlayActive?: () => boolean
}): NotebookInteraction {
  const isPanning = ref(false)
  const touchPoints = new Map<number, { x: number; y: number }>()
  let pinchDistance = 0
  let spaceDown = false
  let frozenScroll: { top: number; left: number } | null = null
  let touchPan: { id: number; x: number; y: number; left: number; top: number } | null = null
  let mousePan: { id: number; x: number; y: number; left: number; top: number } | null = null

  function touchDistance(): number {
    const [a, b] = [...touchPoints.values()]
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0
  }

  function touchMidpoint(): { x: number; y: number } {
    const [a, b] = [...touchPoints.values()]
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : { x: 0, y: 0 }
  }

  function onPointerDown(event: PointerEvent): void {
    if (options.isOverlayActive?.()) return
    if ((event.target as Element | null)?.closest('.notebook-ruler, .notebook-selection')) return
    if (!(event.target as HTMLElement | null)?.closest('.notebook-view__scroller')) return
    if (event.pointerType === 'touch') {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (touchPoints.size === 2) pinchDistance = touchDistance()
      else if (options.scroller.value) touchPan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: options.scroller.value.scrollLeft, top: options.scroller.value.scrollTop }
      event.preventDefault()
      return
    }
    if ((event.button === 1 || spaceDown || options.tool.value === 'hand') && options.scroller.value) {
      mousePan = { id: event.pointerId, x: event.clientX, y: event.clientY, left: options.scroller.value.scrollLeft, top: options.scroller.value.scrollTop }
      isPanning.value = true
      ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
      event.preventDefault()
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (options.isOverlayActive?.()) return
    if ((event.target as Element | null)?.closest('.notebook-ruler, .notebook-selection')) return
    if (event.pointerType === 'touch') {
      if (!touchPoints.has(event.pointerId)) return
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (options.input.isTouchNavigationSuppressed.value) return
      if (touchPoints.size >= 2) {
        const distance = touchDistance()
        const rect = options.scroller.value?.getBoundingClientRect()
        const midpoint = touchMidpoint()
        if (distance > 0 && pinchDistance > 0 && rect) {
          options.viewport.setZoomAt(options.viewport.zoom.value * distance / pinchDistance, midpoint.y - rect.top, midpoint.x - rect.left)
        }
        pinchDistance = distance
      } else if (touchPan?.id === event.pointerId && options.scroller.value) {
        options.scroller.value.scrollLeft = touchPan.left - (event.clientX - touchPan.x)
        options.scroller.value.scrollTop = touchPan.top - (event.clientY - touchPan.y)
      }
      return
    }
    if (mousePan?.id === event.pointerId && options.scroller.value) {
      options.scroller.value.scrollLeft = mousePan.left - (event.clientX - mousePan.x)
      options.scroller.value.scrollTop = mousePan.top - (event.clientY - mousePan.y)
    }
  }

  function onPointerUp(event: PointerEvent): void {
    if ((event.target as Element | null)?.closest('.notebook-ruler, .notebook-selection')) return
    if (event.pointerType === 'touch') {
      touchPoints.delete(event.pointerId)
      options.input.pointerUp(event)
      pinchDistance = touchPoints.size === 2 ? touchDistance() : 0
      const remaining = [...touchPoints.entries()][0]
      touchPan = remaining && options.scroller.value
        ? { id: remaining[0], x: remaining[1].x, y: remaining[1].y, left: options.scroller.value.scrollLeft, top: options.scroller.value.scrollTop }
        : null
      return
    }
    if (mousePan?.id === event.pointerId) {
      mousePan = null
      isPanning.value = false
    } else options.input.pointerUp(event)
  }

  function onPointerCancel(event: PointerEvent): void {
    if ((event.target as Element | null)?.closest('.notebook-ruler, .notebook-selection')) return
    if (event.pointerType !== 'touch') {
      options.input.pointerCancel(event)
      if (mousePan?.id === event.pointerId) { mousePan = null; isPanning.value = false }
      return
    }
    touchPoints.delete(event.pointerId)
    options.input.pointerCancel(event)
    pinchDistance = touchPoints.size === 2 ? touchDistance() : 0
    const remaining = [...touchPoints.entries()][0]
    touchPan = remaining && options.scroller.value
      ? { id: remaining[0], x: remaining[1].x, y: remaining[1].y, left: options.scroller.value.scrollLeft, top: options.scroller.value.scrollTop }
      : null
  }

  function onPagePointerDown(pageId: string, event: PointerEvent): void {
    if (options.isOverlayActive?.()) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (event.pointerType !== 'touch') options.scroller.value?.focus({ preventScroll: true })
    if (options.input.isActive.value) {
      options.input.pointerDown(event)
      return
    }
    if (pageId !== options.activePageId.value) {
      options.input.finish()
      options.document.setCurrentPage(pageId)
      options.activePageId.value = pageId
    }
    if (options.tool.value !== 'hand' && event.button !== 1 && !spaceDown) {
      if (options.scroller.value) frozenScroll = { top: options.scroller.value.scrollTop, left: options.scroller.value.scrollLeft }
      options.input.pointerDown(event)
    }
  }

  function onPagePointerMove(event: PointerEvent): void {
    if (mousePan) onPointerMove(event)
    else if (options.tool.value !== 'hand') options.input.pointerMove(event)
  }

  function onPagePointerUp(event: PointerEvent): void {
    if (mousePan) onPointerUp(event)
    else if (options.tool.value !== 'hand') options.input.pointerUp(event)
  }

  function onPagePointerCancel(event: PointerEvent): void {
    if (mousePan) onPointerUp(event)
    else options.input.pointerCancel(event)
  }

  function onPageLostCapture(event: PointerEvent): void {
    if (options.tool.value !== 'hand') options.input.lostPointerCapture(event)
  }

  function onScroll(event: Event): void {
    if (options.input.isActive.value && frozenScroll && options.scroller.value) {
      options.scroller.value.scrollTop = frozenScroll.top
      options.scroller.value.scrollLeft = frozenScroll.left
      return
    }
    options.viewport.onScroll(event)
  }

  function onWheel(event: WheelEvent): void {
    if (options.input.isActive.value || options.isOverlayActive?.()) { event.preventDefault(); return }
    if (!(event.ctrlKey || event.metaKey)) return
    event.preventDefault()
    const rect = options.scroller.value?.getBoundingClientRect()
    options.viewport.setZoomAt(options.viewport.zoom.value * (event.deltaY < 0 ? 1.08 : 0.92), rect ? event.clientY - rect.top : 0, rect ? event.clientX - rect.left : 0)
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.defaultPrevented || (event.target as HTMLElement | null)?.closest('dialog, [role="dialog"]')) return
    const target = event.target as HTMLElement | null
    if (target?.matches('input, textarea, select, [contenteditable="true"]')) return
    if (event.code === 'Space') { spaceDown = true; event.preventDefault(); return }
    const document = options.document
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      finishBeforeCommand()
      if (event.shiftKey) document.history.redo()
      else document.history.undo()
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault(); finishBeforeCommand(); document.history.redo()
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      if (document.selectedObjectIds.value.length) { finishBeforeCommand(); event.preventDefault(); document.copySelection() }
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      if (document.selectedObjectIds.value.length) { finishBeforeCommand(); event.preventDefault(); document.deleteSelection() }
    } else if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && (event.code === 'KeyH' || event.code === 'KeyV')) {
      // Physical key codes keep Shift+H / Shift+V working on non-Latin layouts.
      if (!document.selectedObjectIds.value.length) return
      finishBeforeCommand()
      event.preventDefault()
      document.flipSelection(event.code === 'KeyH' ? 'horizontal' : 'vertical')
    } else if (event.key === 'Escape') { finishBeforeCommand(); document.clearSelection() }
    else if (event.key.startsWith('Arrow')) {
      if (!options.document.selectedObjectIds.value.length) return
      const distance = event.shiftKey ? 10 : 1
      finishBeforeCommand()
      event.preventDefault()
      if (event.key === 'ArrowLeft') document.moveSelection(-distance, 0)
      if (event.key === 'ArrowRight') document.moveSelection(distance, 0)
      if (event.key === 'ArrowUp') document.moveSelection(0, -distance)
      if (event.key === 'ArrowDown') document.moveSelection(0, distance)
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space') spaceDown = false
  }

  function finishBeforeCommand(): void {
    if (options.tool.value === 'move') options.input.cancel()
    else options.input.finish()
  }

  return {
    isPanning, touchPointerIds: () => [...touchPoints.keys()], onPointerDown, onPointerMove, onPointerUp, onPointerCancel,
    onPagePointerDown, onPagePointerMove, onPagePointerUp, onPagePointerCancel, onPageLostCapture,
    onScroll, onWheel, onKeyDown, onKeyUp, finishBeforeCommand,
  }
}
