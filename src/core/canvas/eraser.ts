import { distanceToSegment } from './hitTest'
import type { CanvasPoint } from './types'

function distanceToEraser(point: CanvasPoint, eraser: readonly CanvasPoint[]): number {
  if (eraser.length === 0) return Number.POSITIVE_INFINITY
  if (eraser.length === 1) return Math.hypot(point.x - eraser[0].x, point.y - eraser[0].y)
  let distance = Number.POSITIVE_INFINITY
  for (let index = 1; index < eraser.length; index += 1) {
    distance = Math.min(distance, distanceToSegment(point, eraser[index - 1], eraser[index]))
  }
  return distance
}

function interpolate(from: CanvasPoint, to: CanvasPoint, ratio: number): CanvasPoint {
  const pressure = from.pressure === undefined && to.pressure === undefined
    ? undefined
    : (from.pressure ?? 0.5) + ((to.pressure ?? 0.5) - (from.pressure ?? 0.5)) * ratio
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio,
    ...(pressure === undefined ? {} : { pressure }),
  }
}

/**
 * Splits a pressure-aware polyline wherever a circular eraser trail crosses it.
 * Sampling is bounded by the eraser radius so a long source segment cannot
 * jump over the erased area. One-point remnants are discarded.
 */
export function eraseStrokeSegments(
  points: readonly CanvasPoint[],
  eraser: readonly CanvasPoint[],
  radius: number,
): CanvasPoint[][] {
  if (points.length < 2 || eraser.length === 0 || radius <= 0) return points.length >= 2 ? [[...points]] : []
  const sampled: CanvasPoint[] = [points[0]]
  const step = Math.max(1, radius / 2)
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step))
    for (let sample = 1; sample <= count; sample += 1) sampled.push(interpolate(from, to, sample / count))
  }

  const segments: CanvasPoint[][] = []
  let current: CanvasPoint[] = []
  let erased = false
  for (const point of sampled) {
    if (distanceToEraser(point, eraser) <= radius) {
      erased = true
      if (current.length >= 2) segments.push(current)
      current = []
    } else {
      current.push(point)
    }
  }
  if (current.length >= 2) segments.push(current)
  return erased ? segments : [[...points]]
}
