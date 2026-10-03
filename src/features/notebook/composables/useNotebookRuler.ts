import { onBeforeUnmount } from 'vue'
import { normalizeNotebookRulerAngle } from '../../../core/notebook/ruler'
import type { NotebookRulerPose } from '../../../core/notebook/ruler'

export function useNotebookRuler(options: {
  pose: () => NotebookRulerPose
  zoom: () => number
  width: () => number
  height: () => number
  disabled: () => boolean
  update: (pose: NotebookRulerPose) => void
  active: (active: boolean) => void
}) {
  let gesture: {
    id: number
    mode: 'move' | 'rotate'
    element: SVGElement
    transform: Pick<DOMMatrix, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>
    pose: NotebookRulerPose
    start: { x: number; y: number }
    angle: number
  } | null = null

  function point(event: PointerEvent, transform: Pick<DOMMatrix, 'a' | 'b' | 'c' | 'd' | 'e' | 'f'>) {
    return { x: transform.a * event.clientX + transform.c * event.clientY + transform.e,
      y: transform.b * event.clientX + transform.d * event.clientY + transform.f }
  }

  function update(pose: NotebookRulerPose): void {
    // Keep the controls reachable even when the ruler extends past a zoomed page edge.
    const margin = 8 + 46 / options.zoom()
    options.update({
      x: Math.max(margin, Math.min(options.width() - margin, pose.x)),
      y: Math.max(margin, Math.min(options.height() - margin, pose.y)),
      angle: normalizeNotebookRulerAngle(pose.angle),
    })
  }

  function down(event: PointerEvent, mode: 'move' | 'rotate'): void {
    if (options.disabled() || gesture || event.button !== 0) return
    const element = event.currentTarget as SVGElement
    const bounds = element.ownerSVGElement?.getBoundingClientRect()
    if (!bounds) return
    event.preventDefault()
    element.focus()
    const zoom = options.zoom()
    const pose = { ...options.pose() }
    // SVG borders and viewBox scaling make the DOM rect differ from page coordinates.
    const transform = element.ownerSVGElement?.getScreenCTM?.()?.inverse()
      ?? { a: 1 / zoom, b: 0, c: 0, d: 1 / zoom, e: -bounds.left / zoom, f: -bounds.top / zoom }
    const start = point(event, transform)
    gesture = { id: event.pointerId, mode, element, transform, pose, start, angle: Math.atan2(start.y - pose.y, start.x - pose.x) }
    options.active(true)
    try { element.setPointerCapture(event.pointerId) } catch { /* Capture may be unavailable in an embedded webview. */ }
  }

  function move(event: PointerEvent): void {
    if (!gesture || event.pointerId !== gesture.id) return
    event.preventDefault()
    const current = point(event, gesture.transform)
    if (gesture.mode === 'move') {
      update({ ...gesture.pose, x: gesture.pose.x + current.x - gesture.start.x, y: gesture.pose.y + current.y - gesture.start.y })
    } else {
      const delta = Math.atan2(current.y - gesture.pose.y, current.x - gesture.pose.x) - gesture.angle
      const angle = gesture.pose.angle + delta * 180 / Math.PI
      update({ ...gesture.pose, angle: event.shiftKey ? Math.round(angle / 15) * 15 : angle })
    }
  }

  function finish(event?: PointerEvent): void {
    if (!gesture || (event && event.pointerId !== gesture.id)) return
    const previous = gesture
    gesture = null
    options.active(false)
    try { previous.element.releasePointerCapture(previous.id) } catch { /* Capture may already have been released. */ }
  }

  function up(event: PointerEvent): void { move(event); finish(event) }

  function key(event: KeyboardEvent, mode: 'move' | 'rotate'): void {
    if (options.disabled() || gesture) return
    const pose = options.pose()
    const step = event.shiftKey ? 10 : 1
    if (event.key === 'Home' && mode === 'rotate') update({ ...pose, angle: 0 })
    else if (mode === 'rotate' && ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
      update({ ...pose, angle: pose.angle + (['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 1) * (event.shiftKey ? 15 : 1) })
    } else if (mode === 'move' && ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp'].includes(event.key)) {
      update({ ...pose, x: pose.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: pose.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) })
    } else return
    event.preventDefault()
  }

  onBeforeUnmount(() => finish())
  return { down, move, up, finish, key }
}
