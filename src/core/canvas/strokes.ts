import type { CanvasBounds, CanvasPoint } from './types'
import getStroke from 'perfect-freehand'

export function strokeBounds(points: readonly CanvasPoint[], padding = 0): CanvasBounds {
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  const left = Math.min(...xs) - padding
  const top = Math.min(...ys) - padding
  const right = Math.max(...xs) + padding
  const bottom = Math.max(...ys) + padding
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  }
}

export function appendStrokePoint(points: CanvasPoint[], point: CanvasPoint, minimumDistance = 0.75): boolean {
  const previous = points[points.length - 1]
  if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < minimumDistance) return false
  points.push(point)
  return true
}

export function strokePointsAttribute(points: readonly CanvasPoint[], origin: CanvasPoint): string {
  return points.map(point => `${point.x - origin.x},${point.y - origin.y}`).join(' ')
}

export function strokeOutlinePath(
  points: readonly CanvasPoint[],
  size: number,
  highlighter = false,
): string {
  const outline = getStroke(
    points.map(point => [point.x, point.y, highlighter ? 0.5 : point.pressure ?? 0.5]),
    {
      size,
      thinning: highlighter ? 0 : 0.6,
      smoothing: 0.5,
      streamline: 0.5,
    },
  )
  if (!outline.length) return ''
  const path = outline.reduce((result, [x, y], index) => {
    if (index === 0) return `M ${x},${y}`
    const [previousX, previousY] = outline[index - 1]
    return `${result} Q ${previousX},${previousY} ${(previousX + x) / 2},${(previousY + y) / 2}`
  }, '')
  const last = outline[outline.length - 1]
  return `${path} L ${last[0]},${last[1]} Z`
}
