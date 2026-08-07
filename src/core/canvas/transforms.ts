import { unionBounds } from './geometry'
import type { CanvasBounds, CanvasElement, CanvasPoint } from './types'

export type CanvasAlignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
export type CanvasDistribution = 'horizontal' | 'vertical'

export function rotatedResizeCursor(rotation = 0): string {
  const normalized = ((rotation % 180) + 180) % 180
  return normalized >= 22.5 && normalized < 67.5
    ? 'nesw-resize'
    : normalized >= 67.5 && normalized < 112.5
      ? 'ns-resize'
      : normalized >= 112.5 && normalized < 157.5
        ? 'nwse-resize'
        : 'nwse-resize'
}

export function alignElements(elements: readonly CanvasElement[], alignment: CanvasAlignment): Record<string, CanvasPoint> {
  const bounds = unionBounds(elements)
  if (!bounds) return {}
  return Object.fromEntries(elements.map((element) => {
    let x = element.x
    let y = element.y
    if (alignment === 'left') x = bounds.x
    if (alignment === 'center') x = bounds.x + (bounds.width - element.width) / 2
    if (alignment === 'right') x = bounds.x + bounds.width - element.width
    if (alignment === 'top') y = bounds.y
    if (alignment === 'middle') y = bounds.y + (bounds.height - element.height) / 2
    if (alignment === 'bottom') y = bounds.y + bounds.height - element.height
    return [element.id, { x, y }]
  }))
}

export function distributeElements(
  elements: readonly CanvasElement[],
  direction: CanvasDistribution,
): Record<string, CanvasPoint> {
  if (elements.length < 3) return {}
  const ordered = [...elements].sort((a, b) => direction === 'horizontal' ? a.x - b.x : a.y - b.y)
  const first = ordered[0]
  const last = ordered[ordered.length - 1]
  const occupied = ordered.reduce((total, element) => total + (direction === 'horizontal' ? element.width : element.height), 0)
  const span = direction === 'horizontal'
    ? last.x + last.width - first.x
    : last.y + last.height - first.y
  const gap = (span - occupied) / (ordered.length - 1)
  let cursor = direction === 'horizontal' ? first.x : first.y
  const result: Record<string, CanvasPoint> = {}
  for (const element of ordered) {
    result[element.id] = direction === 'horizontal'
      ? { x: cursor, y: element.y }
      : { x: element.x, y: cursor }
    cursor += (direction === 'horizontal' ? element.width : element.height) + gap
  }
  return result
}

export function resizeBounds(
  start: CanvasPoint,
  current: CanvasPoint,
  options: { constrain: boolean; fromCenter: boolean },
): CanvasBounds {
  let dx = current.x - start.x
  let dy = current.y - start.y
  if (options.constrain) {
    const size = Math.max(Math.abs(dx), Math.abs(dy))
    dx = Math.sign(dx || 1) * size
    dy = Math.sign(dy || 1) * size
  }
  if (options.fromCenter) {
    return {
      x: start.x - Math.abs(dx),
      y: start.y - Math.abs(dy),
      width: Math.max(1, Math.abs(dx) * 2),
      height: Math.max(1, Math.abs(dy) * 2),
    }
  }
  return {
    x: Math.min(start.x, start.x + dx),
    y: Math.min(start.y, start.y + dy),
    width: Math.max(1, Math.abs(dx)),
    height: Math.max(1, Math.abs(dy)),
  }
}
