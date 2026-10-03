import { shallowRef, type ShallowRef } from 'vue'
import type { EditorView } from 'prosemirror-view'

interface UseCanvasFrameMetricsOptions {
  getEditorView: () => EditorView | null
}

/**
 * Measures the rendered height of the document frame's ProseMirror root via a
 * single ResizeObserver. The measured height stays in a local ref and is
 * never written back into the canvas store — writing it back is what caused
 * the old per-block model's measure -> Yjs -> re-render -> measure loop.
 * Consumers that need on-screen geometry (camera fit, minimap, export)
 * combine this with the stored frame through `effectiveFrameBounds`
 * (`core/canvas/frame`).
 */
export function useCanvasFrameMetrics(options: UseCanvasFrameMetricsOptions) {
  const contentHeight: ShallowRef<number> = shallowRef(0)
  let resizeObserver: ResizeObserver | null = null
  let observedElement: HTMLElement | null = null

  function handleEntries(entries: ResizeObserverEntry[]) {
    const entry = entries[entries.length - 1]
    if (!entry) return
    // `borderBoxSize` and `offsetHeight` are layout pixels; `getBoundingClientRect`
    // is not usable here because the camera scales an ancestor, which would fold
    // the zoom factor into the measured world height.
    const blockSize = entry.borderBoxSize?.[0]?.blockSize
    const measured = typeof blockSize === 'number' && Number.isFinite(blockSize)
      ? blockSize
      : (entry.target as HTMLElement).offsetHeight
    contentHeight.value = Math.max(0, Math.round(measured))
  }

  function observe() {
    const view = options.getEditorView()
    if (!view || typeof ResizeObserver === 'undefined') return
    if (observedElement === view.dom) return
    disconnect()
    resizeObserver = new ResizeObserver(handleEntries)
    resizeObserver.observe(view.dom)
    observedElement = view.dom
    contentHeight.value = view.dom.offsetHeight
  }

  function disconnect() {
    resizeObserver?.disconnect()
    resizeObserver = null
    observedElement = null
  }

  return { contentHeight, observe, disconnect }
}
