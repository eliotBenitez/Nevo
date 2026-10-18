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

  function updateActive() {
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
    updateActive()
  }

  const refreshTask = createIdleTaskScheduler(refreshNow, { delayMs: 150, idleTimeoutMs: 600 })

  function onTransactionDoc(doc: object) {
    if (doc !== lastDoc) refreshTask.schedule()
  }

  function scrollToHeading(index: number) {
    const el = headingEl(items.value[index]?.pos ?? -1)
    if (!el) return
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    el.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' })
  }

  onBeforeUnmount(() => refreshTask.cancel())

  return { items, activeIndex, refreshNow, onTransactionDoc, updateActive, scrollToHeading }
}
