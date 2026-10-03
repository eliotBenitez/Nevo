import type { NotebookPointV1 } from './types'

/** Shape tools available in the notebook editor. */
export type NotebookShapeKind = 'rectangle' | 'ellipse' | 'circle' | 'triangle'

export const NOTEBOOK_SHAPE_KINDS: readonly NotebookShapeKind[] = ['rectangle', 'ellipse', 'circle', 'triangle']

/** Smallest draggable box side, in page points, before a shape is kept. */
export const NOTEBOOK_SHAPE_MIN_SIZE = 1

const CURVE_STEPS = 64

export function isNotebookShapeKind(value: string): value is NotebookShapeKind {
  return (NOTEBOOK_SHAPE_KINDS as readonly string[]).includes(value)
}

/**
 * Snaps the drafted endpoint so the box is square, preserving the drag
 * direction. Used for Shift on every shape and always for the circle tool.
 */
export function snapNotebookShapePoint(anchor: NotebookPointV1, point: NotebookPointV1): NotebookPointV1 {
  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return point
  const side = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    ...point,
    x: anchor.x + Math.sign(dx || 1) * side,
    y: anchor.y + Math.sign(dy || 1) * side,
  }
}

/**
 * Closed centreline points for a shape drafted from the first gesture point to
 * the last. The loop repeats its first point so one stroke outline closes
 * cleanly through the shared renderer. Returns an empty array for missing,
 * non-finite, or degenerate gestures.
 */
export function notebookShapePoints(
  points: readonly NotebookPointV1[],
  shape: NotebookShapeKind,
): NotebookPointV1[] {
  const box = shapeBox(points, shape)
  if (!box) return []
  const { minX, minY, maxX, maxY } = box
  const point = (x: number, y: number): NotebookPointV1 => ({ x, y, pressure: 0.5 })
  if (shape === 'rectangle') {
    return [point(minX, minY), point(maxX, minY), point(maxX, maxY), point(minX, maxY), point(minX, minY)]
  }
  if (shape === 'triangle') {
    const midX = (minX + maxX) / 2
    return [point(midX, minY), point(maxX, maxY), point(minX, maxY), point(midX, minY)]
  }
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  const radiusX = (maxX - minX) / 2
  const radiusY = (maxY - minY) / 2
  const loop: NotebookPointV1[] = []
  for (let step = 0; step < CURVE_STEPS; step += 1) {
    const angle = (step / CURVE_STEPS) * Math.PI * 2
    loop.push(point(centerX + Math.cos(angle) * radiusX, centerY + Math.sin(angle) * radiusY))
  }
  loop.push(loop[0])
  return loop
}

function shapeBox(
  points: readonly NotebookPointV1[],
  shape: NotebookShapeKind,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const start = points[0]
  const end = points[points.length - 1]
  if (points.length < 2 || !start || !end) return null
  if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) return null
  if (shape === 'circle') {
    const side = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y))
    if (side < NOTEBOOK_SHAPE_MIN_SIZE) return null
    const endX = start.x + Math.sign(end.x - start.x || 1) * side
    const endY = start.y + Math.sign(end.y - start.y || 1) * side
    return {
      minX: Math.min(start.x, endX),
      maxX: Math.max(start.x, endX),
      minY: Math.min(start.y, endY),
      maxY: Math.max(start.y, endY),
    }
  }
  const minX = Math.min(start.x, end.x)
  const maxX = Math.max(start.x, end.x)
  const minY = Math.min(start.y, end.y)
  const maxY = Math.max(start.y, end.y)
  if (maxX - minX < NOTEBOOK_SHAPE_MIN_SIZE || maxY - minY < NOTEBOOK_SHAPE_MIN_SIZE) return null
  return { minX, minY, maxX, maxY }
}
