import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { Ref } from 'vue'
import type { NotebookRulerPose } from '../../../core/notebook/ruler'
import type { NotebookPageV1 } from '../../../core/notebook/types'

export function useNotebookRulerOverlay(options: {
  root: Ref<HTMLElement | null>
  scroller: Ref<HTMLElement | null>
  page: () => NotebookPageV1 | null
  zoom: () => number
  inputActive: () => boolean
  beforeToggle: () => void
}) {
  const open = ref(false)
  const active = ref(false)
  const pose = ref<NotebookRulerPose>({ x: 297.64, y: 240, angle: 0 })
  let observer: ResizeObserver | undefined

  function place(center: boolean): void {
    const page = options.page()
    if (!open.value || !page || active.value || options.inputActive()) return
    const svg = Array.from(options.root.value?.querySelectorAll<HTMLElement>('[data-page-id]') ?? [])
      .find(element => element.dataset.pageId === page.id)?.querySelector('.notebook-page')
    const rect = svg?.getBoundingClientRect(), viewport = options.scroller.value?.getBoundingClientRect()
    const zoom = options.zoom(), margin = 8 + 46 / zoom
    let left = margin, right = page.width - margin, top = margin, bottom = page.height - margin
    if (rect && viewport && rect.width && viewport.width) {
      if (rect.bottom <= viewport.top || rect.top >= viewport.bottom) return
      left = Math.max(left, (viewport.left - rect.left) / zoom + margin)
      right = Math.min(right, (viewport.right - rect.left) / zoom - margin)
      top = Math.max(top, (viewport.top - rect.top) / zoom + margin)
      bottom = Math.min(bottom, (viewport.bottom - rect.top) / zoom - margin)
    }
    pose.value = { x: center ? (left + right) / 2 : Math.max(left, Math.min(right, pose.value.x)),
      y: center ? (top + bottom) / 2 : Math.max(top, Math.min(bottom, pose.value.y)), angle: pose.value.angle }
  }

  function toggle(): void { options.beforeToggle(); open.value = !open.value; place(true) }
  onMounted(() => {
    if (typeof ResizeObserver === 'undefined' || !options.scroller.value) return
    observer = new ResizeObserver(() => place(false))
    observer.observe(options.scroller.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  return { open, active, pose, toggle }
}
