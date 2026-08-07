import type * as Y from 'yjs'
import {
  emptyCanvasRichText,
  eraseStrokeSegments,
  getCanvasSharedTypes,
  layoutMindMap as calculateMindMapLayout,
  runCanvasGesture,
  type CanvasBounds,
  type CanvasElement,
  type CanvasPoint,
  type CanvasRichTextDocument,
  type CanvasStrokeElement,
} from '../../../core/canvas'
import { generateBlockId } from '../../../editor-core/plugins/blockIds'

interface UseCanvasP1ElementsOptions {
  getYDoc: () => Y.Doc | null
  getUndoManager: () => Y.UndoManager | null
}

function createElementId(): string {
  return generateBlockId()
}

function nextElementZIndex(elements: Y.Map<CanvasElement>): number {
  return Math.max(-1, ...Array.from(elements.values(), element => element.zIndex)) + 1
}

function strokeBounds(points: readonly CanvasPoint[]): CanvasBounds {
  const xs = points.map(point => point.x)
  const ys = points.map(point => point.y)
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  }
}

function applyMindMapLayout(
  elements: Y.Map<CanvasElement>,
  connectors: ReturnType<typeof getCanvasSharedTypes>['connectors'],
  mapId: string,
) {
  const layout = calculateMindMapLayout(
    Object.fromEntries(elements.entries()),
    Object.fromEntries(connectors.entries()),
    mapId,
  )
  for (const [elementId, patch] of Object.entries(layout.elements)) {
    const element = elements.get(elementId)
    if (element && !element.locked) elements.set(elementId, { ...element, ...patch })
  }
  for (const [connectorId, patch] of Object.entries(layout.connectors)) {
    const connector = connectors.get(connectorId)
    if (connector) connectors.set(connectorId, { ...connector, ...patch })
  }
}

/** Owns P1-only persistent object mutations while sharing the same Yjs undo boundary. */
export function useCanvasP1Elements(options: UseCanvasP1ElementsOptions) {
  function addRichNote(x: number, y: number, bounds: Partial<CanvasBounds> = {}): string {
    const ydoc = options.getYDoc()
    if (!ydoc) return ''
    const id = createElementId()
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, order }) => {
      elements.set(id, {
        id,
        kind: 'note',
        content: emptyCanvasRichText(),
        x: bounds.x ?? x,
        y: bounds.y ?? y,
        width: bounds.width ?? 300,
        height: bounds.height ?? 220,
        zIndex: nextElementZIndex(elements),
        style: { fill: '#fff8c5', stroke: '#e6c84f', strokeWidth: 1, textColor: '#2b2615' },
      })
      order.push([id])
    })
    return id
  }

  function addNoteLink(x: number, y: number, note: { id: string; title: string; icon?: string }): string {
    const ydoc = options.getYDoc()
    if (!ydoc || !note.id) return ''
    const id = createElementId()
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, order }) => {
      elements.set(id, {
        id,
        kind: 'note-link',
        noteId: note.id,
        title: note.title,
        ...(note.icon ? { icon: note.icon } : {}),
        x,
        y,
        width: 280,
        height: 104,
        zIndex: nextElementZIndex(elements),
        style: { fill: '#ffffff', stroke: '#cbd5e1', strokeWidth: 1 },
      })
      order.push([id])
    })
    return id
  }

  function addFrame(x: number, y: number, bounds: Partial<CanvasBounds> = {}, title = ''): string {
    const ydoc = options.getYDoc()
    if (!ydoc) return ''
    const id = createElementId()
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, order }) => {
      const presentationOrder = Array.from(elements.values())
        .filter(element => element.kind === 'frame')
        .reduce((highest, element) => Math.max(highest, element.presentationOrder), -1) + 1
      elements.set(id, {
        id,
        kind: 'frame',
        title,
        presentationOrder,
        x: bounds.x ?? x,
        y: bounds.y ?? y,
        width: bounds.width ?? 960,
        height: bounds.height ?? 540,
        zIndex: -10_000 + presentationOrder,
        style: { fill: '#ffffff08', stroke: '#8b5cf6', strokeWidth: 2 },
      })
      order.insert(0, [id])
    })
    return id
  }

  function addMindMapRoot(x: number, y: number, text = ''): string {
    const ydoc = options.getYDoc()
    if (!ydoc) return ''
    const id = createElementId()
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, order }) => {
      elements.set(id, {
        id,
        kind: 'shape',
        shape: 'rectangle',
        text,
        mindMap: { mapId: id, rank: 0 },
        x,
        y,
        width: 220,
        height: 84,
        zIndex: nextElementZIndex(elements),
        style: { fill: '#8b5cf6', stroke: '#6d28d9', strokeWidth: 2, textColor: '#ffffff', fontSize: 18 },
      })
      order.push([id])
    })
    return id
  }

  function addMindMapChild(parentId: string): string {
    const ydoc = options.getYDoc()
    if (!ydoc) return ''
    const id = createElementId()
    let created = false
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, connectors, order }) => {
      const parent = elements.get(parentId)
      if (parent?.kind !== 'shape' || !parent.mindMap || parent.locked) return
      created = true
      const rank = Array.from(elements.values()).filter(
        element => element.kind === 'shape' && element.mindMap?.parentId === parentId,
      ).length
      elements.set(id, {
        id,
        kind: 'shape',
        shape: 'rectangle',
        text: '',
        mindMap: { mapId: parent.mindMap.mapId, parentId, rank },
        x: parent.x + parent.width + 92,
        y: parent.y + rank * 112,
        width: 200,
        height: 72,
        zIndex: nextElementZIndex(elements),
        style: { fill: '#ffffff', stroke: '#8b5cf6', strokeWidth: 2, textColor: '#292524', fontSize: 16 },
      })
      const connectorId = createElementId()
      connectors.set(connectorId, {
        id: connectorId,
        from: {
          x: parent.x + parent.width,
          y: parent.y + parent.height / 2,
          binding: { target: 'element', targetId: parent.id, side: 'right' },
        },
        to: {
          x: parent.x + parent.width + 92,
          y: parent.y + rank * 112 + 36,
          binding: { target: 'element', targetId: id, side: 'left' },
        },
        routing: 'bezier',
        zIndex: order.length,
        color: '#8b5cf6',
        width: 2,
        startCap: 'none',
        endCap: 'none',
      })
      order.push([connectorId, id])
      applyMindMapLayout(elements, connectors, parent.mindMap.mapId)
    })
    return created ? id : ''
  }

  function layoutMindMap(id: string): boolean {
    const ydoc = options.getYDoc()
    if (!ydoc) return false
    const source = getCanvasSharedTypes(ydoc).elements.get(id)
    if (source?.kind !== 'shape' || !source.mindMap) return false
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, connectors }) => {
      applyMindMapLayout(elements, connectors, source.mindMap!.mapId)
    })
    return true
  }

  function setRichText(id: string, content: CanvasRichTextDocument) {
    const ydoc = options.getYDoc()
    if (!ydoc) return
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements }) => {
      const element = elements.get(id)
      if (element?.kind === 'note' && !element.locked) elements.set(id, { ...element, content })
    })
  }

  function eraseStrokeParts(eraser: readonly CanvasPoint[], radius: number): string[] {
    const ydoc = options.getYDoc()
    if (!ydoc || eraser.length === 0) return []
    const affected: string[] = []
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, connectors, order }) => {
      for (const [id, element] of elements.entries()) {
        if ((element.kind !== 'freehand' && element.kind !== 'highlighter') || element.locked) continue
        const segments = eraseStrokeSegments(element.points, eraser, radius)
        const unchanged = segments.length === 1 && segments[0].length === element.points.length
        if (unchanged) continue
        affected.push(id)
        const index = order.toArray().indexOf(id)
        elements.delete(id)
        if (index >= 0) order.delete(index, 1)
        if (segments.length !== 1) {
          for (const [connectorId, connector] of connectors.entries()) {
            const fromBound = connector.from.binding?.target === 'element' && connector.from.binding.targetId === id
            const toBound = connector.to.binding?.target === 'element' && connector.to.binding.targetId === id
            if (fromBound || toBound) {
              connectors.set(connectorId, {
                ...connector,
                from: fromBound ? { x: connector.from.x, y: connector.from.y } : connector.from,
                to: toBound ? { x: connector.to.x, y: connector.to.y } : connector.to,
              })
            }
          }
        }
        segments.forEach((points, segmentIndex) => {
          const segmentId = segmentIndex === 0 ? id : createElementId()
          const next: CanvasStrokeElement = { ...element, id: segmentId, points, ...strokeBounds(points) }
          elements.set(segmentId, next)
          order.insert(Math.max(0, index) + segmentIndex, [segmentId])
        })
      }
    })
    return affected
  }

  return {
    addRichNote,
    addNoteLink,
    addFrame,
    addMindMapRoot,
    addMindMapChild,
    layoutMindMap,
    setRichText,
    eraseStrokeParts,
  }
}
