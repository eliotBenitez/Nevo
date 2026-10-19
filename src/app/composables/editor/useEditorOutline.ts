import { onBeforeUnmount, ref, shallowRef } from 'vue'
import type { EditorView } from 'prosemirror-view'
import { collectHeadingOutline, findActiveHeadingIndex, type HeadingOutlineItem } from '../../components/editor/headingOutline'
import { createIdleTaskScheduler } from './idleTaskScheduler'

interface EditorOutlineOptions {
  getView: () => EditorView | null | undefined
  getScrollEl: () => HTMLElement | null
}

// A heading becomes active once its top passes this fraction of the viewport.
const ACTIVE_THRESHOLD_RATIO = 0.25

/** Heading outline of the open note for the right-hand outline rail. */
export function useEditorOutline(options: EditorOutlineOptions) {
  const items = shallowRef<HeadingOutlineItem[]>([])
  const activeIndex = ref(-1)
  let lastDoc: object | null = null

  function headingEl(pos: number): HTMLElement | null {
    const el = options.getView()?.nodeDOM(pos)
    return el instanceof HTMLElement ? el : null
  }

  function measureActive() {
    const scrollEl = options.getScrollEl()
    if (!scrollEl || !items.value.length) { activeIndex.value = -1; return }
    const originTop = scrollEl.getBoundingClientRect().top
    const tops = items.value.map((item) => (headingEl(item.pos)?.getBoundingClientRect().top ?? Infinity) - originTop)
    activeIndex.value = findActiveHeadingIndex(tops, scrollEl.clientHeight * ACTIVE_THRESHOLD_RATIO)
  }

  function refreshNow() {
    const doc = options.getView()?.state?.doc ?? null
    lastDoc = doc
    // Headings inside collapsed toggles have no layout and cannot be scrolled to.
    items.value = doc
      ? collectHeadingOutline(doc).filter((item) => (headingEl(item.pos)?.getClientRects().length ?? 0) > 0)
      : []
    measureActive()
  }

  // Items hold positions from the last refresh, so they are stale once the doc has moved on.
  const isStale = () => (options.getView()?.state?.doc ?? null) !== lastDoc

  // Scroll events fire many times per frame; measure every heading at most once per frame.
  let activeFrame: number | null = null
  function updateActive() {
    if (activeFrame !== null) return
    activeFrame = requestAnimationFrame(() => {
      activeFrame = null
      if (isStale()) refreshNow()
      else measureActive()
    })
  }

  const refreshTask = createIdleTaskScheduler(refreshNow, { delayMs: 150, idleTimeoutMs: 600 })

  function onTransactionDoc(doc: object) {
    if (doc !== lastDoc) refreshTask.schedule()
  }

  function scrollToHeading(index: number) {
    const clicked = items.value[index]
    if (!clicked) return
    if (isStale()) refreshNow()
    // After an edit the clicked heading may have moved; pick the same heading nearest its old position.
    const target = items.value
      .filter((item) => item.level === clicked.level && item.text === clicked.text)
      .sort((a, b) => Math.abs(a.pos - clicked.pos) - Math.abs(b.pos - clicked.pos))[0] ?? items.value[index]
    const el = target ? headingEl(target.pos) : null
    if (!el) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    el.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  onBeforeUnmount(() => {
    refreshTask.cancel()
    if (activeFrame !== null) cancelAnimationFrame(activeFrame)
  })

  return { items, activeIndex, refreshNow, onTransactionDoc, updateActive, scrollToHeading }
}
