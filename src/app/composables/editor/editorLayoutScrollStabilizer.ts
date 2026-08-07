export interface EditorLayoutScrollStabilizer {
  preserve: () => boolean
  destroy: () => void
}

interface StabilizerTiming {
  requestAnimationFrame?: (callback: FrameRequestCallback) => number
  cancelAnimationFrame?: (handle: number) => void
  setTimeout?: (callback: () => void, delayMs: number) => number
  clearTimeout?: (handle: number) => void
}

interface EditorLayoutScrollStabilizerOptions {
  getEditorRoot: () => HTMLElement | null
  durationMs?: number
  timing?: StabilizerTiming
}

type LayoutAnchorMarker =
  | { kind: 'range'; value: Range }
  | { kind: 'element'; value: HTMLElement }
  | { kind: 'start' }

interface LayoutScrollAnchor {
  scrollEl: HTMLElement
  marker: LayoutAnchorMarker
  viewportOffset: number
}

type PointDocument = Document & {
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

const DEFAULT_STABILIZE_DURATION_MS = 300
const STABILIZING_CLASS = 'doc-body--layout-stabilizing'

function finiteRectTop(rect: DOMRect | DOMRectReadOnly): number | null {
  return Number.isFinite(rect.top) ? rect.top : null
}

function captureTextRange(
  editorRoot: HTMLElement,
  scrollRect: DOMRect,
): Range | null {
  const proseMirror = editorRoot.querySelector<HTMLElement>('.ProseMirror')
  if (!proseMirror) return null
  const pointDocument = editorRoot.ownerDocument as PointDocument
  if (!pointDocument.caretRangeFromPoint) return null

  const editorRect = proseMirror.getBoundingClientRect()
  const x = Math.min(
    scrollRect.right - 1,
    Math.max(scrollRect.left + 1, editorRect.left + Math.min(48, editorRect.width / 2)),
  )
  const y = Math.min(
    scrollRect.bottom - 1,
    Math.max(scrollRect.top + 12, editorRect.top + 1),
  )
  const range = pointDocument.caretRangeFromPoint(x, y)
  if (!range || !proseMirror.contains(range.startContainer)) return null

  try {
    return finiteRectTop(range.getBoundingClientRect()) === null ? null : range
  } catch {
    return null
  }
}

function captureBlock(
  editorRoot: HTMLElement,
  viewportTop: number,
): HTMLElement | null {
  const blocks = editorRoot.querySelectorAll<HTMLElement>('.ProseMirror > *')
  for (const block of blocks) {
    if (block.getBoundingClientRect().bottom > viewportTop + 1) return block
  }
  return null
}

function markerTop(marker: LayoutAnchorMarker): number | null {
  if (marker.kind === 'start') return 0
  if (marker.kind === 'element') {
    if (!marker.value.isConnected) return null
    return finiteRectTop(marker.value.getBoundingClientRect())
  }
  if (!marker.value.startContainer.isConnected) return null
  try {
    return finiteRectTop(marker.value.getBoundingClientRect())
  } catch {
    return null
  }
}

export function captureEditorLayoutScrollAnchor(
  editorRoot: HTMLElement,
): LayoutScrollAnchor | null {
  const scrollEl = editorRoot.closest<HTMLElement>('.doc-body')
  if (!scrollEl) return null
  if (scrollEl.scrollTop <= 1) {
    return { scrollEl, marker: { kind: 'start' }, viewportOffset: 0 }
  }

  const scrollRect = scrollEl.getBoundingClientRect()
  const range = captureTextRange(editorRoot, scrollRect)
  if (range) {
    const top = markerTop({ kind: 'range', value: range })
    if (top !== null) {
      return {
        scrollEl,
        marker: { kind: 'range', value: range },
        viewportOffset: top - scrollRect.top,
      }
    }
  }

  const block = captureBlock(editorRoot, scrollRect.top)
  if (!block) return null
  return {
    scrollEl,
    marker: { kind: 'element', value: block },
    viewportOffset: block.getBoundingClientRect().top - scrollRect.top,
  }
}

export function restoreEditorLayoutScrollAnchor(anchor: LayoutScrollAnchor): boolean {
  if (!anchor.scrollEl.isConnected) return false
  if (anchor.marker.kind === 'start') {
    anchor.scrollEl.scrollTop = 0
    return true
  }

  const top = markerTop(anchor.marker)
  if (top === null) return false
  const currentOffset = top - anchor.scrollEl.getBoundingClientRect().top
  const delta = currentOffset - anchor.viewportOffset
  if (Math.abs(delta) >= 0.5) anchor.scrollEl.scrollTop += delta
  return true
}

/**
 * Keeps the current editor content at the same visual Y coordinate while the
 * shell animates panel widths and text above the viewport repeatedly reflows.
 */
export function createEditorLayoutScrollStabilizer(
  options: EditorLayoutScrollStabilizerOptions,
): EditorLayoutScrollStabilizer {
  const requestFrame = options.timing?.requestAnimationFrame
    ?? ((callback: FrameRequestCallback) => window.requestAnimationFrame(callback))
  const cancelFrame = options.timing?.cancelAnimationFrame
    ?? ((handle: number) => window.cancelAnimationFrame(handle))
  const setTimer = options.timing?.setTimeout
    ?? ((callback: () => void, delayMs: number) => window.setTimeout(callback, delayMs))
  const clearTimer = options.timing?.clearTimeout
    ?? ((handle: number) => window.clearTimeout(handle))

  let anchor: LayoutScrollAnchor | null = null
  let frame: number | null = null
  let timer: number | null = null

  function stop() {
    if (frame !== null) {
      cancelFrame(frame)
      frame = null
    }
    if (timer !== null) {
      clearTimer(timer)
      timer = null
    }
    anchor?.scrollEl.classList.remove(STABILIZING_CLASS)
    anchor = null
  }

  function stabilizeFrame() {
    frame = null
    if (!anchor || !restoreEditorLayoutScrollAnchor(anchor)) {
      stop()
      return
    }
    frame = requestFrame(stabilizeFrame)
  }

  function preserve() {
    const editorRoot = options.getEditorRoot()
    if (!editorRoot) return false
    const nextAnchor = captureEditorLayoutScrollAnchor(editorRoot)
    if (!nextAnchor) return false

    stop()
    anchor = nextAnchor
    anchor.scrollEl.classList.add(STABILIZING_CLASS)
    frame = requestFrame(stabilizeFrame)
    timer = setTimer(stop, options.durationMs ?? DEFAULT_STABILIZE_DURATION_MS)
    return true
  }

  return {
    preserve,
    destroy: stop,
  }
}
