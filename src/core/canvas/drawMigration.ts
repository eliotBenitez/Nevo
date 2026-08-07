import type { CanvasConnector, CanvasElement } from './types'

export interface LegacyDrawStroke {
  id?: string
  type: string
  points: Array<{ x: number; y: number }>
  color: string
  size: number
  text?: string
  rotation?: number
  fillColor?: string
  opacity?: number
  groupId?: string
  locked?: boolean
  assetSrc?: string
  arrowShape?: 'straight' | 'orthogonal' | 'bezier'
  startBinding?: { strokeId: string }
  endBinding?: { strokeId: string }
}

export interface MigratedDrawStrokes {
  elements: Record<string, CanvasElement>
  connectors: Record<string, CanvasConnector>
  order: string[]
}

function bounds(points: readonly { x: number; y: number }[]) {
  const x = Math.min(...points.map(point => point.x))
  const y = Math.min(...points.map(point => point.y))
  const right = Math.max(...points.map(point => point.x))
  const bottom = Math.max(...points.map(point => point.y))
  return { x, y, width: Math.max(24, right - x), height: Math.max(24, bottom - y) }
}

export function convertDrawStrokesToCanvas(
  strokes: readonly LegacyDrawStroke[],
  idFactory: () => string,
): MigratedDrawStrokes {
  const elements: Record<string, CanvasElement> = {}
  const connectors: Record<string, CanvasConnector> = {}
  const order: string[] = []
  const remappedIds = new Map<string, string>()

  for (const stroke of strokes) {
    if (!stroke.points.length) continue
    const id = stroke.id || idFactory()
    if (stroke.id) remappedIds.set(stroke.id, id)
    order.push(id)
    const zIndex = order.length - 1
    const box = bounds(stroke.points)
    const common = {
      id,
      ...box,
      zIndex,
      ...(stroke.rotation ? { rotation: stroke.rotation * 180 / Math.PI } : {}),
      ...(stroke.groupId ? { groupId: stroke.groupId } : {}),
      ...(stroke.locked ? { locked: true } : {}),
      style: {
        stroke: stroke.color,
        strokeWidth: stroke.size,
        ...(stroke.fillColor ? { fill: stroke.fillColor } : {}),
        ...(stroke.opacity !== undefined ? { opacity: stroke.opacity } : {}),
      },
    }

    if (stroke.type === 'arrow' || stroke.type === 'line') {
      const from = stroke.points[0]
      const to = stroke.points[stroke.points.length - 1]
      connectors[id] = {
        id,
        from: { x: from.x, y: from.y },
        to: { x: to.x, y: to.y },
        routing: stroke.arrowShape ?? 'straight',
        zIndex,
        color: stroke.color,
        width: stroke.size,
      }
    } else if (stroke.type === 'rectangle' || stroke.type === 'ellipse' || stroke.type === 'diamond') {
      elements[id] = {
        ...common,
        kind: 'shape',
        shape: stroke.type,
      }
    } else if (stroke.type === 'text') {
      elements[id] = { ...common, kind: 'text', text: stroke.text ?? '' }
    } else if (stroke.type === 'image' && stroke.assetSrc) {
      elements[id] = { ...common, kind: 'image', src: stroke.assetSrc }
    } else if (stroke.type === 'freehand' || stroke.type === 'highlighter') {
      elements[id] = { ...common, kind: stroke.type, points: stroke.points.map(point => ({ x: point.x, y: point.y })) }
    } else {
      order.pop()
    }
  }

  for (const [index, stroke] of strokes.entries()) {
    const id = stroke.id ? remappedIds.get(stroke.id) : order[index]
    const connector = id ? connectors[id] : undefined
    if (!connector) continue
    const startId = stroke.startBinding?.strokeId
    const endId = stroke.endBinding?.strokeId
    if (startId && remappedIds.has(startId)) {
      connector.from.binding = { target: 'element', targetId: remappedIds.get(startId)! }
    }
    if (endId && remappedIds.has(endId)) {
      connector.to.binding = { target: 'element', targetId: remappedIds.get(endId)! }
    }
  }

  return { elements, connectors, order }
}
