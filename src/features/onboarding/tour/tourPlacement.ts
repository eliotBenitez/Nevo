import type { TourStepSide } from './tourSteps'

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface PlaceCoachmarkOptions {
  /** Bounding rect of the live element being spotlighted, in viewport coordinates. */
  target: Rect
  coach: { width: number; height: number }
  viewport: { width: number; height: number }
  side: TourStepSide
  /** Gap between the spotlight ring and the coachmark. */
  gap?: number
  /** Minimum distance kept between the coachmark and the viewport edge. */
  margin?: number
  /** Padding added around the target to form the ring. */
  pad?: number
}

export interface PlaceCoachmarkResult {
  ring: Rect
  coach: { left: number; top: number }
  /** Resolved side after flipping for available space — may differ from the requested side. */
  side: TourStepSide
  arrowOffset: { top?: number; left?: number }
}

const RING_EDGE_INSET = 4
const ARROW_INSET = 6
const ARROW_MIN = 14
const ARROW_SIZE = 26

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value))
}

/** Keeps the ring fully inside the viewport, shrinking it rather than letting it spill offscreen. */
function clampRingToViewport(x: number, y: number, w: number, h: number, viewport: { width: number; height: number }): Rect {
  if (x < RING_EDGE_INSET) { w -= RING_EDGE_INSET - x; x = RING_EDGE_INSET }
  if (y < RING_EDGE_INSET) { h -= RING_EDGE_INSET - y; y = RING_EDGE_INSET }
  const maxRight = viewport.width - RING_EDGE_INSET
  if (x + w > maxRight) w = Math.max(0, maxRight - x)
  const maxBottom = viewport.height - RING_EDGE_INSET
  if (y + h > maxBottom) h = Math.max(0, maxBottom - y)
  return { left: x, top: y, width: Math.max(0, w), height: Math.max(0, h) }
}

/**
 * Pure placement math for the tour's spotlight ring + coachmark, ported from
 * the `place()` function in docs/design/nevo-reference.html (#tour). Flips
 * right<->left and bottom<->top when there isn't enough room on the
 * requested side, and clamps both the ring and the coachmark to the
 * viewport so neither is ever cut off or drawn offscreen.
 */
export function placeCoachmark(options: PlaceCoachmarkOptions): PlaceCoachmarkResult {
  const { target, coach, viewport, side: requestedSide, gap = 14, margin = 12, pad = 4 } = options

  const rawX = target.left - pad
  const rawY = target.top - pad
  const rawW = target.width + pad * 2
  const rawH = target.height + pad * 2
  const ring = clampRingToViewport(rawX, rawY, rawW, rawH, viewport)
  const { left: x, top: y, width: w, height: h } = ring

  const cw = coach.width
  const ch = coach.height
  const W = viewport.width
  const H = viewport.height

  let side = requestedSide
  if (side === 'right' && x + w + gap + cw > W - margin) side = 'left'
  if (side === 'bottom' && y + h + gap + ch > H - margin) side = 'top'

  let left: number
  let top: number
  if (side === 'right' || side === 'left') {
    left = side === 'right' ? x + w + gap : x - cw - gap
    top = clamp(y + h / 2 - ch / 2, margin, Math.max(margin, H - ch - margin))
  } else {
    top = side === 'bottom' ? y + h + gap : y - ch - gap
    left = clamp(x + w / 2 - cw / 2, margin, Math.max(margin, W - cw - margin))
  }
  // Beyond the reference: also clamp the primary axis so the coachmark can
  // never be placed (partially) offscreen on very small viewports.
  left = clamp(left, margin, Math.max(margin, W - cw - margin))
  top = clamp(top, margin, Math.max(margin, H - ch - margin))

  const arrowOffset: { top?: number; left?: number } = {}
  if (side === 'right' || side === 'left') {
    arrowOffset.top = clamp(y + h / 2 - top - ARROW_INSET, ARROW_MIN, Math.max(ARROW_MIN, ch - ARROW_SIZE))
  } else {
    arrowOffset.left = clamp(x + w / 2 - left - ARROW_INSET, ARROW_MIN, Math.max(ARROW_MIN, cw - ARROW_SIZE))
  }

  return {
    ring,
    coach: { left: Math.round(left), top: Math.round(top) },
    side,
    arrowOffset,
  }
}
