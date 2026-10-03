import type { NotebookLineStyle, NotebookPointV1 } from './types'

/** Shift constrains a straight line to the nearest multiple of fifteen degrees. */
export const NOTEBOOK_LINE_ANGLE_STEP = Math.PI / 12

const SOLID: NotebookLineStyle = 'solid'
const DASH_MIN = 6
const GAP_MIN = 4
const DOT_MIN_SPACING = 6

/**
 * Normalizes an arbitrary pointer gesture to the two flat endpoints of a
 * straight line. Returns null for missing or non-finite geometry.
 */
export function notebookLineEndpoints(points: readonly NotebookPointV1[]): [NotebookPointV1, NotebookPointV1] | null {
  const start = points[0]
  const end = points[points.length - 1]
  if (points.length < 2 || !start || !end) return null
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null
  return [
    { x: start.x, y: start.y, pressure: 0.5 },
    { x: end.x, y: end.y, pressure: 0.5 },
  ]
}

/** Snaps the endpoint to the nearest angle step while preserving the drawn length. */
export function snapNotebookAngle(
  start: NotebookPointV1,
  end: NotebookPointV1,
  step = NOTEBOOK_LINE_ANGLE_STEP,
): NotebookPointV1 {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (![dx, dy, step].every(Number.isFinite) || step <= 0) return end
  const length = Math.hypot(dx, dy)
  if (length === 0) return end
  const snapped = Math.round(Math.atan2(dy, dx) / step) * step
  return { ...end, x: start.x + Math.cos(snapped) * length, y: start.y + Math.sin(snapped) * length }
}

/**
 * Expands a normalized straight-line stroke into the point arrays that should
 * be filled by the shared outline renderer. `solid` stays a single segment;
 * `dashed` yields ordered two-point segments; `dotted` yields single-point
 * dots. Spacing scales with the stroke width so the pattern stays readable.
 */
export function notebookLineSegments(
  points: readonly NotebookPointV1[],
  width: number,
  dash: NotebookLineStyle = SOLID,
): NotebookPointV1[][] {
  const endpoints = notebookLineEndpoints(points)
  if (!endpoints || !Number.isFinite(width) || width <= 0) return []
  const [start, end] = endpoints
  if (dash === SOLID) return [[start, end]]
  const length = Math.hypot(end.x - start.x, end.y - start.y)
  if (length < 1) return []
  const ux = (end.x - start.x) / length
  const uy = (end.y - start.y) / length
  const at = (t: number): NotebookPointV1 => ({ x: start.x + ux * t, y: start.y + uy * t, pressure: 0.5 })
  if (dash === 'dotted') {
    const spacing = Math.max(width * 2, DOT_MIN_SPACING)
    const dots = Math.max(1, Math.floor(length / spacing) + 1)
    return Array.from({ length: dots }, (_, index) => [at(index * spacing)])
  }
  const dashLength = Math.max(width * 3, DASH_MIN)
  const gap = Math.max(width * 2, GAP_MIN)
  const segments: NotebookPointV1[][] = []
  for (let offset = 0; offset < length; offset += dashLength + gap) {
    segments.push([at(offset), at(Math.min(offset + dashLength, length))])
  }
  return segments
}
