import type { CanvasConnector, CanvasElement, CanvasShapeElement } from './types'

export interface CanvasMindMapLayoutOptions {
  horizontalGap?: number
  verticalGap?: number
}

export interface CanvasMindMapLayout {
  elements: Record<string, Pick<CanvasShapeElement, 'x' | 'y'>>
  connectors: Record<string, Pick<CanvasConnector, 'from' | 'to'>>
}

function mapNodes(elements: Readonly<Record<string, CanvasElement>>, mapId: string): CanvasShapeElement[] {
  return Object.values(elements)
    .filter((element): element is CanvasShapeElement => element.kind === 'shape' && element.mindMap?.mapId === mapId)
}

export function layoutMindMap(
  elements: Readonly<Record<string, CanvasElement>>,
  connectors: Readonly<Record<string, CanvasConnector>>,
  mapId: string,
  options: CanvasMindMapLayoutOptions = {},
): CanvasMindMapLayout {
  const nodes = mapNodes(elements, mapId)
  const root = nodes.find(node => !node.mindMap?.parentId)
  if (!root) return { elements: {}, connectors: {} }
  const horizontalGap = options.horizontalGap ?? 92
  const verticalGap = options.verticalGap ?? 28
  const children = new Map<string, CanvasShapeElement[]>()
  for (const node of nodes) {
    const parentId = node.mindMap?.parentId
    if (!parentId) continue
    const bucket = children.get(parentId) ?? []
    bucket.push(node)
    bucket.sort((a, b) => (a.mindMap?.rank ?? 0) - (b.mindMap?.rank ?? 0) || a.zIndex - b.zIndex)
    children.set(parentId, bucket)
  }

  const subtreeHeight = new Map<string, number>()
  function measure(node: CanvasShapeElement, trail = new Set<string>()): number {
    if (trail.has(node.id)) return node.height
    const nextTrail = new Set(trail).add(node.id)
    const descendants = (children.get(node.id) ?? []).filter(child => !nextTrail.has(child.id))
    const height = descendants.length
      ? descendants.reduce((sum, child) => sum + measure(child, nextTrail), 0) + verticalGap * (descendants.length - 1)
      : node.height
    const measured = Math.max(node.height, height)
    subtreeHeight.set(node.id, measured)
    return measured
  }
  measure(root)

  const positions: CanvasMindMapLayout['elements'] = { [root.id]: { x: root.x, y: root.y } }
  function place(node: CanvasShapeElement, x: number, top: number, trail = new Set<string>()) {
    if (trail.has(node.id)) return
    const nextTrail = new Set(trail).add(node.id)
    const descendants = (children.get(node.id) ?? []).filter(child => !nextTrail.has(child.id))
    let cursor = top
    for (const child of descendants) {
      const height = subtreeHeight.get(child.id) ?? child.height
      const childY = cursor + (height - child.height) / 2
      const childX = x + node.width + horizontalGap
      positions[child.id] = { x: childX, y: childY }
      place(child, childX, cursor, nextTrail)
      cursor += height + verticalGap
    }
  }
  place(root, root.x, root.y - ((subtreeHeight.get(root.id) ?? root.height) - root.height) / 2)

  const connectorPatches: CanvasMindMapLayout['connectors'] = {}
  for (const connector of Object.values(connectors)) {
    const fromId = connector.from.binding?.target === 'element' ? connector.from.binding.targetId : null
    const toId = connector.to.binding?.target === 'element' ? connector.to.binding.targetId : null
    if (!fromId || !toId || !positions[fromId] || !positions[toId]) continue
    const from = elements[fromId]
    const to = elements[toId]
    if (!from || !to) continue
    connectorPatches[connector.id] = {
      from: {
        x: positions[fromId].x + from.width,
        y: positions[fromId].y + from.height / 2,
        binding: { target: 'element', targetId: fromId, side: 'right' },
      },
      to: {
        x: positions[toId].x,
        y: positions[toId].y + to.height / 2,
        binding: { target: 'element', targetId: toId, side: 'left' },
      },
    }
  }
  return { elements: positions, connectors: connectorPatches }
}
