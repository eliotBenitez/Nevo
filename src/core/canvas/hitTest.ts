import type { CanvasBounds, CanvasConnectorEndpoint, CanvasElement, CanvasPoint } from './types'

export function pointInBounds(point: CanvasPoint, bounds: CanvasBounds, padding = 0): boolean {
  return point.x >= bounds.x - padding
    && point.x <= bounds.x + bounds.width + padding
    && point.y >= bounds.y - padding
    && point.y <= bounds.y + bounds.height + padding
}

export function distanceToSegment(point: CanvasPoint, from: CanvasPoint, to: CanvasPoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - from.x, point.y - from.y)
  const ratio = Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (from.x + ratio * dx), point.y - (from.y + ratio * dy))
}

export function hitConnector(
  point: CanvasPoint,
  from: CanvasConnectorEndpoint,
  to: CanvasConnectorEndpoint,
  tolerance: number,
): boolean {
  return distanceToSegment(point, from, to) <= tolerance
}

export function hitElement(point: CanvasPoint, element: CanvasElement, padding = 0): boolean {
  if (!pointInBounds(point, element, padding)) return false
  if (element.kind === 'shape' && element.shape === 'ellipse') {
    const radiusX = element.width / 2 + padding
    const radiusY = element.height / 2 + padding
    const dx = point.x - (element.x + element.width / 2)
    const dy = point.y - (element.y + element.height / 2)
    return (dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY) <= 1
  }
  return true
}

export function nearestElement(
  point: CanvasPoint,
  elements: Readonly<Record<string, CanvasElement>>,
  excludeIds: ReadonlySet<string> = new Set(),
  padding = 12,
): CanvasElement | null {
  return Object.values(elements)
    .filter(element => !excludeIds.has(element.id) && pointInBounds(point, element, padding))
    .sort((a, b) => b.zIndex - a.zIndex)[0] ?? null
}
