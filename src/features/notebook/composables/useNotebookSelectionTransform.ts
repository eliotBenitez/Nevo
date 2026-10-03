import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { notebookSelectionBounds, transformNotebookSelection, type NotebookSelectionTransform } from '../../../core/notebook/selectionTransform'
import type { NotebookPageV1 } from '../../../core/notebook/types'

export type NotebookSelectionHandle = 'move' | 'rotate' | 'scale-nw' | 'scale-ne' | 'scale-sw' | 'scale-se'

export function useNotebookSelectionTransform(options: {
  page: () => NotebookPageV1
  ids: () => string[]
  zoom: () => number
  disabled: () => boolean
  commit: (transform: NotebookSelectionTransform) => void
  active: (active: boolean) => void
}) {
  const preview = shallowRef<NotebookPageV1 | null>(null)
  const bounds = computed(() => notebookSelectionBounds((preview.value ?? options.page()).objects.filter(object => options.ids().includes(object.id))))
  let gesture: {
    id: number; mode: NotebookSelectionHandle; element: SVGElement
    matrix: Pick<DOMMatrix, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>
    page: NotebookPageV1; ids: string[]; cx: number; cy: number; x: number; y: number
    transform: NotebookSelectionTransform
  } | null = null

  function point(event: PointerEvent, matrix: Pick<DOMMatrix, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>) {
    return { x: matrix.a * event.clientX + matrix.c * event.clientY + matrix.e,
      y: matrix.b * event.clientX + matrix.d * event.clientY + matrix.f }
  }

  function down(event: PointerEvent, mode: NotebookSelectionHandle): void {
    if (options.disabled() || gesture || event.button !== 0 || !bounds.value) return
    const element = event.currentTarget as SVGElement
    const svg = element.ownerSVGElement, rect = svg?.getBoundingClientRect()
    if (!rect) return
    event.preventDefault()
    element.focus()
    const zoom = options.zoom(), b = bounds.value
    const matrix = svg?.getScreenCTM?.()?.inverse()
      ?? { a: 1 / zoom, b: 0, c: 0, d: 1 / zoom, e: -rect.left / zoom, f: -rect.top / zoom }
    const start = point(event, matrix)
    gesture = { id: event.pointerId, mode, element, matrix, page: options.page(), ids: [...options.ids()],
      cx: b.x + b.width / 2, cy: b.y + b.height / 2, ...start, transform: {} }
    options.active(true)
    try { element.setPointerCapture(event.pointerId) } catch { /* Capture can be unavailable in a webview. */ }
  }

  function move(event: PointerEvent): void {
    if (!gesture || event.pointerId !== gesture.id) return
    event.preventDefault()
    const current = point(event, gesture.matrix), g = gesture
    if (g.mode === 'move') g.transform = { dx: current.x - g.x, dy: current.y - g.y }
    else if (g.mode === 'rotate') {
      const angle = (Math.atan2(current.y - g.cy, current.x - g.cx) - Math.atan2(g.y - g.cy, g.x - g.cx)) * 180 / Math.PI
      g.transform = { angle: event.shiftKey ? Math.round(angle / 15) * 15 : angle }
    } else {
      const vx = g.x - g.cx, vy = g.y - g.cy
      const denominator = vx * vx + vy * vy
      g.transform = { scale: denominator > 1e-8 ? Math.max(.05, ((current.x - g.cx) * vx + (current.y - g.cy) * vy) / denominator) : 1 }
    }
    preview.value = transformNotebookSelection(g.page, g.ids, g.transform)
  }

  function finish(commit: boolean): void {
    if (!gesture) return
    const previous = gesture
    gesture = null
    preview.value = null
    options.active(false)
    try { previous.element.releasePointerCapture(previous.id) } catch { /* Capture may already be released. */ }
    if (commit) options.commit(previous.transform)
  }

  function up(event: PointerEvent): void {
    if (!gesture || event.pointerId !== gesture.id) return
    move(event)
    finish(true)
  }

  function cancel(event?: PointerEvent): void {
    if (!event || gesture?.id === event.pointerId) finish(false)
  }

  function key(event: KeyboardEvent, mode: NotebookSelectionHandle): void {
    if (event.key === 'Escape' && gesture) { event.preventDefault(); cancel(); return }
    if (options.disabled() || gesture || !event.key.startsWith('Arrow')) return
    event.preventDefault()
    const negative = event.key === 'ArrowLeft' || event.key === 'ArrowDown'
    if (mode === 'rotate') options.commit({ angle: (negative ? -1 : 1) * (event.shiftKey ? 15 : 1) })
    else if (mode === 'move') {
      const distance = event.shiftKey ? 10 : 1
      options.commit({ dx: event.key === 'ArrowLeft' ? -distance : event.key === 'ArrowRight' ? distance : 0,
        dy: event.key === 'ArrowUp' ? -distance : event.key === 'ArrowDown' ? distance : 0 })
    } else options.commit({ scale: negative ? .95 : 1.05 })
  }

  watch(() => [options.page(), options.ids(), options.disabled()] as const, () => cancel())
  onBeforeUnmount(() => cancel())
  return { preview, bounds, down, move, up, cancel, key }
}
