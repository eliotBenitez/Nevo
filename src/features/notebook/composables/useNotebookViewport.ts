import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { NOTEBOOK_A4_HEIGHT, NOTEBOOK_A4_WIDTH } from '../../../core/notebook/types'

const PAGE_GAP = 44
const MIN_ZOOM = 0.35
const MAX_ZOOM = 3.5
// Horizontal chrome around a page: NotebookPage's shell pads 30px on each side,
// plus a little slack so rounding never leaves a sliver cut off.
const FIT_WIDTH_MARGIN = 64

/** Zoom that fits an A4 page into the container width, capped at 100% so wide containers keep the default. */
export function fitNotebookWidthZoom(containerWidth: number): number {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return 1
  const fit = (containerWidth - FIT_WIDTH_MARGIN) / NOTEBOOK_A4_WIDTH
  return Math.min(1, Math.max(MIN_ZOOM, fit))
}

export interface NotebookViewport {
  zoom: Ref<number>
  scrollTop: Ref<number>
  viewportHeight: Ref<number>
  viewportWidth: Ref<number>
  rowHeight: ComputedRef<number>
  totalHeight: ComputedRef<number>
  visibleRange: ComputedRef<{ start: number; end: number }>
  selectedIndex: ComputedRef<number>
  attach(element: () => HTMLElement | null): void
  onScroll(event: Event): void
  setZoom(zoom: number): void
  setZoomAt(zoom: number, localY: number, localX?: number): void
  zoomBy(factor: number): void
  scrollToPage(index: number): void
}

export function createNotebookViewport(pageCount: () => number): NotebookViewport {
  const zoom = ref(1)
  const scrollTop = ref(0)
  const viewportHeight = ref(800)
  const viewportWidth = ref(800)
  let getElement: () => HTMLElement | null = () => null
  let initialFitDone = false
  const rowHeight = computed(() => NOTEBOOK_A4_HEIGHT * zoom.value + PAGE_GAP)
  const totalHeight = computed(() => Math.max(1, pageCount()) * rowHeight.value)
  const selectedIndex = computed(() => Math.max(0, Math.min(pageCount() - 1, Math.floor(scrollTop.value / rowHeight.value))))
  const visibleRange = computed(() => {
    const firstVisible = selectedIndex.value
    const lastVisible = Math.max(firstVisible, Math.floor((scrollTop.value + viewportHeight.value - 1) / rowHeight.value))
    return {
      start: Math.max(0, firstVisible - 1),
      end: Math.min(pageCount(), lastVisible + 2),
    }
  })

  function attach(element: () => HTMLElement | null): void {
    getElement = element
  }

  function onScroll(event: Event): void {
    const element = event.currentTarget as HTMLElement
    scrollTop.value = Math.max(0, element.scrollTop)
    viewportHeight.value = Math.max(1, element.clientHeight)
    viewportWidth.value = Math.max(1, element.clientWidth)
    if (!initialFitDone && element.clientWidth > 0) {
      initialFitDone = true
      zoom.value = fitNotebookWidthZoom(element.clientWidth)
    }
  }

  function setZoom(value: number): void {
    setZoomAt(value, 0)
  }

  function setZoomAt(value: number, localY: number, localX = 0): void {
    initialFitDone = true
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number.isFinite(value) ? value : zoom.value))
    if (next === zoom.value) return
    const element = getElement()
    const oldZoom = zoom.value
    const currentTop = element ? element.scrollTop : scrollTop.value
    const currentLeft = element ? element.scrollLeft : 0
    const anchor = currentTop + Math.max(0, localY)
    const pageIndex = Math.floor(anchor / rowHeight.value)
    const withinRow = anchor - pageIndex * rowHeight.value
    const pageHeightAtOldZoom = NOTEBOOK_A4_HEIGHT * oldZoom
    const documentOffset = Math.min(withinRow, pageHeightAtOldZoom) / oldZoom
    const nextTop = Math.max(0, pageIndex * (NOTEBOOK_A4_HEIGHT * next + PAGE_GAP) + documentOffset * next - Math.max(0, localY))
    const oldPageOffset = Math.max(0, (viewportWidth.value - NOTEBOOK_A4_WIDTH * oldZoom) / 2)
    const nextPageOffset = Math.max(0, (viewportWidth.value - NOTEBOOK_A4_WIDTH * next) / 2)
    const pagePoint = (currentLeft + Math.max(0, localX) - oldPageOffset) / oldZoom
    const nextLeft = Math.max(0, nextPageOffset + pagePoint * next - Math.max(0, localX))
    zoom.value = next
    scrollTop.value = nextTop
    if (element) { element.scrollTop = nextTop; element.scrollLeft = nextLeft }
  }

  function zoomBy(factor: number): void {
    setZoom(zoom.value * factor)
  }

  function scrollToPage(index: number): void {
    const element = getElement()
    const top = Math.max(0, Math.min(pageCount() - 1, Math.trunc(index))) * rowHeight.value
    if (element) {
      const reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
      if (typeof element.scrollTo === 'function') element.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' })
      else element.scrollTop = top
    }
    scrollTop.value = top
  }

  return { zoom, scrollTop, viewportHeight, viewportWidth, rowHeight, totalHeight, visibleRange, selectedIndex, attach, onScroll, setZoom, setZoomAt, zoomBy, scrollToPage }
}
