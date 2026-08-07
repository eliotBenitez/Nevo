export type WheelIntent = 'zoom' | 'pan'

/** A classic mouse wheel reports line/page deltas — WebKitGTK does exactly
 *  this — or, where it reports pixels, large quantized steps with no
 *  horizontal component. A trackpad reports small pixel deltas and usually
 *  some `deltaX` while scrolling. */
const DISCRETE_PIXEL_STEP = 50

/** A trackpad emits a continuous burst of events; a mouse wheel emits isolated
 *  ones. Classifying once per burst keeps a fast two-finger flick (whose later
 *  deltas can look wheel-sized) from flipping to zoom mid-scroll. */
const GESTURE_IDLE_MS = 250

const LINE_HEIGHT_PX = 16
const PAGE_HEIGHT_PX = 400

function looksLikeMouseWheel(event: WheelEvent): boolean {
  if (event.deltaMode !== 0) return true
  return event.deltaX === 0 && Math.abs(event.deltaY) >= DISCRETE_PIXEL_STEP
}

/** Converts a delta to CSS pixels. `deltaY` alone is meaningless: the same
 *  scroll is ~3 in `DOM_DELTA_LINE` and ~100 in `DOM_DELTA_PIXEL`, so anything
 *  that scales with the raw value must normalize first. */
export function wheelDeltaToPixels(value: number, deltaMode: number): number {
  if (deltaMode === 1) return value * LINE_HEIGHT_PX
  if (deltaMode === 2) return value * PAGE_HEIGHT_PX
  return value
}

/**
 * Decides whether a wheel event should zoom or pan the canvas, so both a mouse
 * and a trackpad work without modifiers. Ctrl/Cmd (which is also what a
 * trackpad pinch synthesizes) always means zoom; otherwise the device is
 * inferred from the event shape and the decision is held for the rest of the
 * gesture.
 */
export function createWheelGestureClassifier() {
  let intent: WheelIntent | null = null
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  function classify(event: WheelEvent): WheelIntent {
    if (event.ctrlKey || event.metaKey) return 'zoom'
    if (intent === null) intent = looksLikeMouseWheel(event) ? 'zoom' : 'pan'
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      idleTimer = null
      intent = null
    }, GESTURE_IDLE_MS)
    return intent
  }

  function dispose() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
    intent = null
  }

  return { classify, dispose }
}
