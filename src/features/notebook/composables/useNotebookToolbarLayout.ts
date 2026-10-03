import { nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref, type WatchSource } from 'vue'

/** Minimum clear space between the side groups and the centered tools, in px. */
const GAP = 8

/**
 * Decides when the notebook toolbar must use its two-row layout. Fixed width
 * breakpoints went stale whenever controls were added (palette swatches, the
 * image button), so the side groups overlapped the centered tools. Instead, the
 * single-row layout is measured: if the left or right group would cross the
 * tools, the toolbar goes compact and remembers the width it needs to return.
 *
 * Measuring runs in Vue's post-flush, before the browser paints, so switching
 * layouts never shows an overlapping frame.
 */
export function useNotebookToolbarLayout(root: Ref<HTMLElement | null>, content: WatchSource<unknown>) {
  const compact = ref(false)
  let requiredWidth = 0
  let observer: ResizeObserver | null = null

  /** Pixels by which the single-row layout overlaps; 0 when it fits or cannot be measured. */
  function overflow(): number {
    const element = root.value
    const left = element?.querySelector('.notebook-toolbar__left')?.getBoundingClientRect()
    const tools = element?.querySelector('.notebook-toolbar__tools')?.getBoundingClientRect()
    const right = element?.querySelector('.notebook-toolbar__right')?.getBoundingClientRect()
    if (!left || !tools || !right || !tools.width) return 0
    return Math.max(0, left.right + GAP - tools.left, tools.right + GAP - right.left)
  }

  function check(): void {
    const element = root.value
    const amount = overflow()
    if (!element || amount <= 0) return
    // The side columns share the free width equally, so each extra pixel of
    // toolbar width moves the centered tools by half a pixel.
    requiredWidth = element.clientWidth + amount * 2
    compact.value = true
  }

  async function measure(): Promise<void> {
    if (!root.value) return
    compact.value = false
    await nextTick()
    check()
  }

  function onResize(): void {
    const element = root.value
    if (!element) return
    if (!compact.value) check()
    else if (element.clientWidth >= requiredWidth) void measure()
  }

  watch(content, () => { void measure() }, { flush: 'post' })

  onMounted(() => {
    void measure()
    if (typeof ResizeObserver === 'function' && root.value) {
      observer = new ResizeObserver(onResize)
      observer.observe(root.value)
    }
  })

  onBeforeUnmount(() => observer?.disconnect())

  return { compact, measure }
}
