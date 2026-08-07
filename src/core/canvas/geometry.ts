import type {
  CanvasBounds,
  CanvasBindingTarget,
  CanvasCamera,
  CanvasConnector,
  CanvasConnectorEndpoint,
  CanvasConnectorSide,
  CanvasPoint,
} from './types'

export function worldToScreen(point: CanvasPoint, camera: CanvasCamera): CanvasPoint {
  return {
    x: (point.x - camera.x) * camera.zoom,
    y: (point.y - camera.y) * camera.zoom,
  }
}

export function screenToWorld(point: CanvasPoint, camera: CanvasCamera): CanvasPoint {
  return {
    x: point.x / camera.zoom + camera.x,
    y: point.y / camera.zoom + camera.y,
  }
}

export function intersects(a: CanvasBounds, b: CanvasBounds): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y
}

export function unionBounds(items: readonly CanvasBounds[]): CanvasBounds | null {
  if (!items.length) return null
  const left = Math.min(...items.map(item => item.x))
  const top = Math.min(...items.map(item => item.y))
  const right = Math.max(...items.map(item => item.x + item.width))
  const bottom = Math.max(...items.map(item => item.y + item.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

export function snapValue(value: number, gridSize: number, threshold: number): number {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return value
  const snapped = Math.round(value / gridSize) * gridSize
  return Math.abs(value - snapped) <= threshold ? snapped : value
}

export function nearestSide(bounds: CanvasBounds, point: CanvasPoint): CanvasConnectorSide {
  const distances: Array<[CanvasConnectorSide, number]> = [
    ['top', Math.abs(point.y - bounds.y)],
    ['right', Math.abs(point.x - (bounds.x + bounds.width))],
    ['bottom', Math.abs(point.y - (bounds.y + bounds.height))],
    ['left', Math.abs(point.x - bounds.x)],
  ]
  distances.sort((a, b) => a[1] - b[1])
  return distances[0][0]
}

export function pointOnSide(bounds: CanvasBounds, side: CanvasConnectorSide): CanvasPoint {
  if (side === 'top') return { x: bounds.x + bounds.width / 2, y: bounds.y }
  if (side === 'right') return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 }
  if (side === 'bottom') return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }
  return { x: bounds.x, y: bounds.y + bounds.height / 2 }
}

export function reflowConnectorBinding(
  connector: CanvasConnector,
  target: CanvasBindingTarget,
  targetId: string,
  bounds: CanvasBounds,
): CanvasConnector {
  let changed = false
  const next = structuredClone(connector)
  for (const key of ['from', 'to'] as const) {
    const endpoint = next[key]
    if (endpoint.binding?.target !== target || endpoint.binding.targetId !== targetId) continue
    const side = endpoint.binding.side ?? nearestSide(bounds, endpoint)
    Object.assign(endpoint, pointOnSide(bounds, side), {
      binding: { ...endpoint.binding, side },
    })
    changed = true
  }
  return changed ? next : connector
}

export function connectorPath(from: CanvasConnectorEndpoint, to: CanvasConnectorEndpoint, routing: 'straight' | 'orthogonal' | 'bezier'): string {
  if (routing === 'orthogonal') {
    const middleX = (from.x + to.x) / 2
    return `M ${from.x} ${from.y} L ${middleX} ${from.y} L ${middleX} ${to.y} L ${to.x} ${to.y}`
  }
  if (routing === 'bezier') {
    const distance = Math.max(40, Math.abs(to.x - from.x) / 2)
    return `M ${from.x} ${from.y} C ${from.x + distance} ${from.y}, ${to.x - distance} ${to.y}, ${to.x} ${to.y}`
  }
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
}
