import { nearestSide, pointOnSide } from './geometry'
import type { CanvasBounds, CanvasConnectorEndpoint, CanvasElement, CanvasPoint } from './types'

export function bindConnectorEndpoint(
  point: CanvasPoint,
  elements: Readonly<Record<string, CanvasElement>>,
  frame: CanvasBounds,
  threshold: number,
): CanvasConnectorEndpoint {
  const targets: Array<{ target: 'block' | 'element'; id: string; bounds: CanvasBounds }> = [
    { target: 'block', id: 'canvas:document', bounds: frame },
    ...Object.values(elements).map(element => ({ target: 'element' as const, id: element.id, bounds: element })),
  ]
  const candidate = targets
    .map(target => ({ ...target, distance: distanceToBounds(point, target.bounds) }))
    .filter(target => target.distance <= threshold)
    .sort((a, b) => a.distance - b.distance)[0]
  if (!candidate) return { ...point }
  const side = nearestSide(candidate.bounds, point)
  return {
    ...pointOnSide(candidate.bounds, side),
    binding: { target: candidate.target, targetId: candidate.id, side },
  }
}

export function connectorMidpoint(from: CanvasPoint, to: CanvasPoint): CanvasPoint {
  return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
}

function distanceToBounds(point: CanvasPoint, bounds: CanvasBounds): number {
  const dx = Math.max(bounds.x - point.x, 0, point.x - (bounds.x + bounds.width))
  const dy = Math.max(bounds.y - point.y, 0, point.y - (bounds.y + bounds.height))
  if (dx || dy) return Math.hypot(dx, dy)
  return Math.min(
    Math.abs(point.x - bounds.x),
    Math.abs(point.x - (bounds.x + bounds.width)),
    Math.abs(point.y - bounds.y),
    Math.abs(point.y - (bounds.y + bounds.height)),
  )
}
