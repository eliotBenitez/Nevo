import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import { computeScrollbarMetrics, mapThumbDragToScrollTop, mapTrackClickToScrollTop } from '../../components/editor/scrollbarMetrics'

interface ScrollbarRefs {
  editorScrollEl: Ref<HTMLElement | null>
  scrollbarTrackEl: Ref<HTMLDivElement | null>
  editorWrapEl: Ref<HTMLDivElement | null>
  supportsHover: Ref<boolean>
}

export function useEditorScrollbar(refs: ScrollbarRefs) {
  const scrollbarVisible = ref(false)
  const scrollbarScrollable = ref(false)
  const scrollbarDragging = ref(false)
  const thumbHeight = ref(0)
  const thumbOffset = ref(0)
  const editorScrollTop = ref(0)

  let hideScrollbarTimer: number | null = null
  let dragStartClientY = 0
  let dragStartThumbOffset = 0

  function clearScrollbarHideTimer() {
    if (hideScrollbarTimer === null) return
    window.clearTimeout(hideScrollbarTimer)
    hideScrollbarTimer = null
  }

  function getScrollbarTrackHeight(scrollEl: HTMLElement): number {
    const trackHeight = refs.scrollbarTrackEl.value?.clientHeight ?? 0
    return trackHeight > 0 ? trackHeight : Math.max(0, scrollEl.clientHeight - 28)
  }

  function updateScrollbarMetrics() {
    const scrollEl = refs.editorScrollEl.value
    if (!scrollEl) { scrollbarScrollable.value = false; thumbHeight.value = 0; thumbOffset.value = 0; return }
    editorScrollTop.value = scrollEl.scrollTop
    const metrics = computeScrollbarMetrics({ scrollTop: scrollEl.scrollTop, scrollHeight: scrollEl.scrollHeight, clientHeight: scrollEl.clientHeight, trackHeight: getScrollbarTrackHeight(scrollEl) })
    scrollbarScrollable.value = metrics.isScrollable
    thumbHeight.value = metrics.thumbHeight
    thumbOffset.value = metrics.thumbOffset
    if (!metrics.isScrollable) { scrollbarVisible.value = false; scrollbarDragging.value = false; clearScrollbarHideTimer() }
  }

  function shouldKeepScrollbarVisible() {
    if (!refs.supportsHover.value) return false
    if (scrollbarDragging.value) return true
    return refs.editorWrapEl.value?.matches(':hover') ?? false
  }

  function showScrollbar() {
    if (!refs.supportsHover.value || !scrollbarScrollable.value) return
    clearScrollbarHideTimer()
    scrollbarVisible.value = true
  }

  function scheduleScrollbarHide() {
    clearScrollbarHideTimer()
    if (!scrollbarScrollable.value || scrollbarDragging.value) return
    hideScrollbarTimer = window.setTimeout(() => {
      hideScrollbarTimer = null
      if (shouldKeepScrollbarVisible()) return
      scrollbarVisible.value = false
    }, 700)
  }

  async function refreshScrollbarMetrics() {
    await nextTick()
    updateScrollbarMetrics()
  }

  function onEditorMouseEnter() { if (!refs.supportsHover.value) return; updateScrollbarMetrics(); showScrollbar() }
  function onEditorMouseLeave() { if (!refs.supportsHover.value || scrollbarDragging.value) return; clearScrollbarHideTimer(); scrollbarVisible.value = false }
  function onEditorScroll() { updateScrollbarMetrics(); showScrollbar(); scheduleScrollbarHide() }

  function onScrollbarTrackMouseDown(event: MouseEvent) {
    if (event.button !== 0) return
    const scrollEl = refs.editorScrollEl.value; if (!scrollEl) return
    event.preventDefault(); updateScrollbarMetrics()
    const trackRect = refs.scrollbarTrackEl.value?.getBoundingClientRect()
    const clickOffsetY = trackRect ? event.clientY - trackRect.top : event.offsetY
    scrollEl.scrollTop = mapTrackClickToScrollTop({ clickOffsetY, trackHeight: getScrollbarTrackHeight(scrollEl), scrollHeight: scrollEl.scrollHeight, clientHeight: scrollEl.clientHeight })
    updateScrollbarMetrics(); showScrollbar(); scheduleScrollbarHide()
  }

  function onScrollbarThumbMouseDown(event: MouseEvent) {
    if (event.button !== 0) return
    event.preventDefault(); event.stopPropagation()
    updateScrollbarMetrics(); showScrollbar(); clearScrollbarHideTimer()
    scrollbarDragging.value = true; dragStartClientY = event.clientY; dragStartThumbOffset = thumbOffset.value
  }

  function onDocumentMouseMove(event: MouseEvent) {
    if (!scrollbarDragging.value) return
    const scrollEl = refs.editorScrollEl.value; if (!scrollEl) return
    scrollEl.scrollTop = mapThumbDragToScrollTop({ pointerDeltaY: event.clientY - dragStartClientY, startThumbOffset: dragStartThumbOffset, trackHeight: getScrollbarTrackHeight(scrollEl), thumbHeight: thumbHeight.value, scrollHeight: scrollEl.scrollHeight, clientHeight: scrollEl.clientHeight })
    updateScrollbarMetrics(); scrollbarVisible.value = true
  }

  function onDocumentMouseUp() {
    if (!scrollbarDragging.value) return
    scrollbarDragging.value = false; updateScrollbarMetrics()
    if (shouldKeepScrollbarVisible()) { showScrollbar(); return }
    scheduleScrollbarHide()
  }

  onMounted(() => {
    document.addEventListener('mousemove', onDocumentMouseMove)
    document.addEventListener('mouseup', onDocumentMouseUp)
    window.addEventListener('resize', updateScrollbarMetrics)
    void refreshScrollbarMetrics()
  })

  onBeforeUnmount(() => {
    document.removeEventListener('mousemove', onDocumentMouseMove)
    document.removeEventListener('mouseup', onDocumentMouseUp)
    window.removeEventListener('resize', updateScrollbarMetrics)
    clearScrollbarHideTimer()
  })

  return {
    scrollbarVisible, scrollbarScrollable, scrollbarDragging, thumbHeight, thumbOffset, editorScrollTop,
    updateScrollbarMetrics, refreshScrollbarMetrics,
    onEditorMouseEnter, onEditorMouseLeave, onEditorScroll,
    onScrollbarTrackMouseDown, onScrollbarThumbMouseDown,
  }
}
