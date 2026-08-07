import { onBeforeUnmount, watch, type Ref } from 'vue'

export interface PinchZoomUpdate {
  center: { x: number; y: number }
  panDelta: { x: number; y: number }
  scaleFactor: number
}

interface UsePinchZoomOptions<T extends Element> {
  target: Ref<T | null>
  onStart?: () => void
  onUpdate: (update: PinchZoomUpdate) => void
  onEnd?: () => void
}

interface PinchMetrics {
  center: { x: number; y: number }
  distance: number
}

/**
 * Owns two-finger touch gestures without changing mouse, wheel, or pen input.
 * Pointer listeners run in the capture phase so an active pinch does not leak
 * into the surface's drawing, selection, or drag handlers.
 */
export function usePinchZoom<T extends Element>(options: UsePinchZoomOptions<T>) {
  const pointers = new Map<number, { x: number; y: number }>()
  let previous: PinchMetrics | null = null
  let pinching = false
  let suppressUntilReleased = false
  let attachedTarget: T | null = null

  function metrics(): PinchMetrics | null {
    const [first, second] = [...pointers.values()]
    if (!first || !second) return null
    return {
      center: {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
      },
      distance: Math.hypot(second.x - first.x, second.y - first.y),
    }
  }

  function consume(event: PointerEvent) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  function localPoint(point: { x: number; y: number }) {
    const rect = attachedTarget?.getBoundingClientRect()
    return {
      x: point.x - (rect?.left ?? 0),
      y: point.y - (rect?.top ?? 0),
    }
  }

  function captureTrackedPointers() {
    const target = attachedTarget
    if (!target || !('setPointerCapture' in target)) return
    for (const pointerId of pointers.keys()) {
      try {
        ;(target as Element & { setPointerCapture(pointerId: number): void }).setPointerCapture(pointerId)
      } catch {
        // A pointer can disappear between pointerdown and capture on WebKit.
      }
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType !== 'touch') return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size < 2 || pinching) {
      if (suppressUntilReleased) consume(event)
      return
    }

    previous = metrics()
    if (!previous) return
    pinching = true
    suppressUntilReleased = true
    captureTrackedPointers()
    options.onStart?.()
    consume(event)
  }

  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!pinching || !previous) {
      if (suppressUntilReleased) consume(event)
      return
    }

    const current = metrics()
    if (!current) return
    if (previous.distance > 0 && current.distance > 0) {
      options.onUpdate({
        center: localPoint(current.center),
        panDelta: {
          x: current.center.x - previous.center.x,
          y: current.center.y - previous.center.y,
        },
        scaleFactor: current.distance / previous.distance,
      })
    }
    previous = current
    consume(event)
  }

  function finishPointer(event: PointerEvent) {
    if (event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return
    pointers.delete(event.pointerId)
    if (suppressUntilReleased) consume(event)
    if (pinching && pointers.size < 2) {
      pinching = false
      previous = null
      options.onEnd?.()
    }
    if (pointers.size === 0) suppressUntilReleased = false
  }

  function detach() {
    if (!attachedTarget) return
    attachedTarget.removeEventListener('pointerdown', onPointerDown as EventListener, true)
    attachedTarget.removeEventListener('pointermove', onPointerMove as EventListener, true)
    attachedTarget.removeEventListener('pointerup', finishPointer as EventListener, true)
    attachedTarget.removeEventListener('pointercancel', finishPointer as EventListener, true)
    attachedTarget = null
    pointers.clear()
    previous = null
    pinching = false
    suppressUntilReleased = false
  }

  function attach(target: T | null) {
    detach()
    if (!target) return
    attachedTarget = target
    target.addEventListener('pointerdown', onPointerDown as EventListener, { capture: true, passive: false })
    target.addEventListener('pointermove', onPointerMove as EventListener, { capture: true, passive: false })
    target.addEventListener('pointerup', finishPointer as EventListener, { capture: true, passive: false })
    target.addEventListener('pointercancel', finishPointer as EventListener, { capture: true, passive: false })
  }

  const stopWatching = watch(options.target, attach, { immediate: true, flush: 'post' })
  onBeforeUnmount(() => {
    stopWatching()
    detach()
  })
}
