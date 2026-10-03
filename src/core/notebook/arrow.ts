import type { NotebookPointV1 } from './types'

export function notebookArrowSegments(points: readonly NotebookPointV1[], width: number): NotebookPointV1[][] {
  const start = points[0]
  const end = points[points.length - 1]
  if (points.length < 2 || !start || !end || !Number.isFinite(width) || width <= 0
    || ![start.x, start.y, end.x, end.y].every(Number.isFinite)) return []
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(length) || length < 1) return []
  const ux = dx / length
  const uy = dy / length
  const headLength = Math.min(Math.max(8, width * 4), length * 0.45)
  const baseX = end.x - ux * headLength
  const baseY = end.y - uy * headLength
  const halfWidth = headLength * 0.45
  const point = (x: number, y: number): NotebookPointV1 => ({ x, y, pressure: 0.5 })
  return [
    [point(start.x, start.y), point(end.x, end.y)],
    [point(baseX - uy * halfWidth, baseY + ux * halfWidth), point(end.x, end.y)],
    [point(baseX + uy * halfWidth, baseY - ux * halfWidth), point(end.x, end.y)],
  ]
}
