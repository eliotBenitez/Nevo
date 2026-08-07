import { computed, onBeforeUnmount, onMounted, shallowRef, type ComputedRef, type Ref, type ShallowRef } from 'vue'
import {
  bindConnectorEndpoint,
  nearestElement,
  pointOnSide,
  screenToWorld,
  type CanvasBounds,
  type CanvasCamera,
  type CanvasConnector,
  type CanvasConnectorEndpoint,
  type CanvasConnectorSide,
  type CanvasElement,
  type CanvasPoint,
  type CanvasSnapshotV1,
} from '../../../core/canvas'
import type { CanvasTool, CanvasToolStyle } from './useCanvasToolState'

/** Screen pixels of slack, converted to world units by the live zoom, that keep
 *  the pointer "over" an element while it sits on one of that element's anchor
 *  dots (which render just outside the element's bounds). */
const ANCHOR_HOVER_PADDING = 16
/** A gesture that ends within this many screen pixels of where it started is
 *  read as a click, not a drag — it must not fabricate a zero-length connector. */
const MIN_CONNECT_DRAG_PX = 8

export interface CanvasQuickConnectDraft {
  from: CanvasConnectorEndpoint
  to: CanvasConnectorEndpoint
}

interface UseCanvasQuickConnectOptions {
  snapshot: Ref<CanvasSnapshotV1>
  /** Plain, non-reactive camera (see `useCanvasCamera`) — pointer math reads
   *  this, never the reactive render copy. */
  camera: CanvasCamera
  effectiveFrame: Ref<CanvasBounds>
  viewport: Ref<HTMLElement | null>
  activeTool: Ref<CanvasTool>
  /** Needed to fall back to the single selected element when nothing is
   *  hovered; not owned by this composable. */
  selectedIds: Ref<readonly string[]>
  /** False while presenting, while inline/rich text editing is open, while a
   *  creation tool other than `select` is active, or while space-pan is held. */
  enabled: Ref<boolean>
  toolStyle: Ref<CanvasToolStyle>
  addConnector: (connector: Omit<CanvasConnector, 'id' | 'zIndex'>) => string
  select: (id: string) => void
}

export function useCanvasQuickConnect(options: UseCanvasQuickConnectOptions) {
  const hoveredId: ShallowRef<string> = shallowRef('')
  const draft: ShallowRef<CanvasQuickConnectDraft | null> = shallowRef(null)
  const targetId: ShallowRef<string> = shallowRef('')

  let hoverFrame: number | null = null
  let pendingHoverPoint: CanvasPoint | null = null
  let gesture: {
    pointerId: number
    from: CanvasConnectorEndpoint
    startScreen: CanvasPoint
    moved: boolean
  } | null = null

  // `enabled` covers presentation/editing/pan state; `activeTool` is checked
  // again here so this composable stays self-sufficient even if a caller
  // forgets to fold the tool into its `enabled` computation.
  const gestureAllowed = computed(() => options.enabled.value && options.activeTool.value === 'select')

  const anchorObject: ComputedRef<CanvasElement | null> = computed(() => {
    if (!gestureAllowed.value) return null
    const hovered = hoveredId.value ? options.snapshot.value.elements[hoveredId.value] : null
    if (hovered && !hovered.locked) return hovered
    if (options.selectedIds.value.length === 1) {
      const selected = options.snapshot.value.elements[options.selectedIds.value[0]]
      if (selected && !selected.locked) return selected
    }
    return null
  })

  const anchors: ComputedRef<Array<{ side: CanvasConnectorSide; point: CanvasPoint }>> = computed(() => {
    const element = anchorObject.value
    if (!element) return []
    return (['top', 'right', 'bottom', 'left'] as const).map(side => ({ side, point: pointOnSide(element, side) }))
  })

  function screenPoint(event: PointerEvent): CanvasPoint | null {
    const rect = options.viewport.value?.getBoundingClientRect()
    if (!rect) return null
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function endGesture() {
    gesture = null
    draft.value = null
    targetId.value = ''
  }

  function onAnchorPointerDown(side: CanvasConnectorSide, event: PointerEvent) {
    if (!gestureAllowed.value) return
    const element = anchorObject.value
    if (!element) return
    const screen = screenPoint(event)
    if (!screen) return
    const from: CanvasConnectorEndpoint = {
      ...pointOnSide(element, side),
      binding: { target: 'element', targetId: element.id, side },
    }
    gesture = { pointerId: event.pointerId, from, startScreen: screen, moved: false }
    draft.value = { from, to: { ...from } }
    targetId.value = ''
    options.viewport.value?.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function onGesturePointerMove(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const screen = screenPoint(event)
    if (!screen) return
    const dx = screen.x - gesture.startScreen.x
    const dy = screen.y - gesture.startScreen.y
    if (Math.hypot(dx, dy) >= MIN_CONNECT_DRAG_PX) gesture.moved = true
    const point = screenToWorld(screen, options.camera)
    const to = bindConnectorEndpoint(point, options.snapshot.value.elements, options.effectiveFrame.value, 16 / options.camera.zoom)
    draft.value = { from: gesture.from, to }
    targetId.value = to.binding ? to.binding.targetId : ''
  }

  function flushHover() {
    hoverFrame = null
    const point = pendingHoverPoint
    pendingHoverPoint = null
    if (!point) return
    const padding = ANCHOR_HOVER_PADDING / options.camera.zoom
    const element = nearestElement(point, options.snapshot.value.elements, new Set(), padding)
    const nextId = element?.id ?? ''
    if (nextId !== hoveredId.value) hoveredId.value = nextId
  }

  function onHoverPointerMove(event: PointerEvent) {
    if (!gestureAllowed.value) return
    // Any held button means another gesture owns the pointer — dragging an
    // element, drawing a marquee, panning. Anchors chasing the cursor through
    // someone else's drag is noise, and they are unclickable then anyway.
    if (event.buttons !== 0) {
      if (hoveredId.value) hoveredId.value = ''
      return
    }
    const screen = screenPoint(event)
    if (!screen) return
    pendingHoverPoint = screenToWorld(screen, options.camera)
    if (hoverFrame === null) hoverFrame = requestAnimationFrame(flushHover)
  }

  function onWindowPointerMove(event: PointerEvent) {
    if (gesture) onGesturePointerMove(event)
    else onHoverPointerMove(event)
  }

  function onWindowPointerUp(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const current = draft.value
    const source = gesture.from.binding
    const moved = gesture.moved
    endGesture()
    if (!current || !moved) return
    const binding = current.to.binding
    // A drop that missed a target, or landed back on the source element,
    // creates nothing: the gesture means "connect A to B", so a stray
    // free-floating arrow would be a silent surprise, not a convenience.
    if (!binding || binding.targetId === source?.targetId) return
    const id = options.addConnector({
      from: current.from,
      to: current.to,
      ...options.toolStyle.value.connector,
      routing: options.toolStyle.value.connector.routing ?? 'straight',
    })
    if (id) options.select(id)
  }

  function onWindowPointerCancel(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return
    endGesture()
  }

  function onWindowKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !gesture) return
    endGesture()
  }

  onMounted(() => {
    window.addEventListener('pointermove', onWindowPointerMove)
    window.addEventListener('pointerup', onWindowPointerUp)
    window.addEventListener('pointercancel', onWindowPointerCancel)
    window.addEventListener('keydown', onWindowKeyDown)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onWindowPointerMove)
    window.removeEventListener('pointerup', onWindowPointerUp)
    window.removeEventListener('pointercancel', onWindowPointerCancel)
    window.removeEventListener('keydown', onWindowKeyDown)
    if (hoverFrame !== null) cancelAnimationFrame(hoverFrame)
    hoverFrame = null
  })

  return { hoveredId, anchorObject, anchors, draft, targetId, onAnchorPointerDown, cancel: endGesture }
}
