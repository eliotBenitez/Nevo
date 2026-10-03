import type { NotebookPathCommand, NotebookPointV1 } from './types'

type Point = { x: number; y: number }

/** Exact constant-width rings for small convex, explicitly closed half-pressure strokes. */
export function closedNotebookStrokeContours(points: readonly NotebookPointV1[], width: number): Point[][] | null {
  // Generated curves have 64 samples plus closure; longer pen strokes keep their existing renderer.
  if (points.length < 4 || points.length > 65 || !Number.isFinite(width) || width <= 0) return null
  const first = points[0], last = points[points.length - 1]
  if (first.x !== last.x || first.y !== last.y
    || points.some(point => point.pressure !== 0.5 || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null
  const vertices = points.slice(0, -1)
  const area = vertices.reduce((sum, point, index) => {
    const next = vertices[(index + 1) % vertices.length]
    return sum + (point.x - first.x) * (next.y - first.y) - (next.x - first.x) * (point.y - first.y)
  }, 0)
  if (!Number.isFinite(area) || Math.abs(area) < 1e-9) return null
  const direction = Math.sign(area)
  const normals: Point[] = []
  for (let index = 0; index < vertices.length; index += 1) {
    const point = vertices[index], next = vertices[(index + 1) % vertices.length]
    const dx = next.x - point.x, dy = next.y - point.y
    const length = Math.hypot(dx, dy)
    if (length < 1e-9) return null
    const after = vertices[(index + 2) % vertices.length]
    if (direction * (dx * (after.y - next.y) - dy * (after.x - next.x)) < -1e-9) return null
    normals.push({ x: direction * dy / length, y: -direction * dx / length })
  }
  const offset = (distance: number): Point[] => vertices.flatMap((point, index) => {
    const prior = normals[(index + normals.length - 1) % normals.length], next = normals[index]
    const divisor = 1 + prior.x * next.x + prior.y * next.y
    const dx = distance * (prior.x + next.x) / divisor
    const dy = distance * (prior.y + next.y) / divisor
    if (distance > 0 && (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.hypot(dx, dy) > distance * 4)) {
      return [{ x: point.x + prior.x * distance, y: point.y + prior.y * distance },
        { x: point.x + next.x * distance, y: point.y + next.y * distance }]
    }
    return [{ x: point.x + dx, y: point.y + dy }]
  })
  const outer = offset(width / 2)
  const inner = offset(-width / 2)
  // Very small shapes have no room for a hole; avoid an inverted inner contour.
  const hasInterior = inner.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)
    && vertices.every((vertex, index) => (point.x - vertex.x) * normals[index].x
      + (point.y - vertex.y) * normals[index].y <= -width / 2 + 1e-7))
  return hasInterior ? [outer, inner.reverse()] : [outer]
}

export function closedNotebookStrokeOutline(points: readonly NotebookPointV1[], width: number): NotebookPathCommand[] | null {
  const contours = closedNotebookStrokeContours(points, width)
  return contours?.flatMap(contour => [
    ...contour.map<NotebookPathCommand>((point, index) => ({ type: index ? 'L' : 'M', ...point })),
    { type: 'Z' } as const,
  ]) ?? null
}
