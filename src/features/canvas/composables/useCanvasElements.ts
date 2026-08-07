import type * as Y from 'yjs'
import {
  alignElements,
  distributeElements,
  getCanvasSharedTypes,
  reflowConnectorBinding,
  runCanvasGesture,
  textElementSize,
  type CanvasAlignment,
  type CanvasBounds,
  type CanvasClipboardPayload,
  type CanvasConnector,
  type CanvasDistribution,
  type CanvasElement,
  type CanvasElementStyle,
  type CanvasPoint,
  type CanvasShapeElement,
} from '../../../core/canvas'
import { generateBlockId } from '../../../editor-core/plugins/blockIds'

interface UseCanvasElementsOptions {
  getYDoc: () => Y.Doc | null
  getUndoManager: () => Y.UndoManager | null
}

type CanvasElementPatch = Partial<Omit<CanvasElement, 'id' | 'kind'>>

function reflowBoundConnectors(ydoc: Y.Doc, id: string) {
  const types = getCanvasSharedTypes(ydoc)
  const element = types.elements.get(id)
  if (!element) return
  for (const [connectorId, connector] of types.connectors.entries()) {
    const next = reflowConnectorBinding(connector, 'element', id, element)
    if (next !== connector) types.connectors.set(connectorId, next)
  }
}

function rewriteOrder(order: Y.Array<string>, ids: readonly string[]) {
  if (order.length) order.delete(0, order.length)
  if (ids.length) order.push([...ids])
}

function nextElementZIndex(elements: Y.Map<CanvasElement>): number {
  return Math.max(-1, ...Array.from(elements.values(), element => element.zIndex)) + 1
}

function createElementId(): string {
  return generateBlockId()
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

function applyElementPatch(element: CanvasElement, patch: CanvasElementPatch): CanvasElement {
  if (element.kind !== 'freehand' && element.kind !== 'highlighter') {
    return { ...element, ...patch } as CanvasElement
  }
  const nextX = patch.x ?? element.x
  const nextY = patch.y ?? element.y
  const nextWidth = patch.width ?? element.width
  const nextHeight = patch.height ?? element.height
  const scaleX = nextWidth / Math.max(1, element.width)
  const scaleY = nextHeight / Math.max(1, element.height)
  return {
    ...element,
    ...patch,
    points: element.points.map(point => ({
      ...point,
      x: nextX + (point.x - element.x) * scaleX,
      y: nextY + (point.y - element.y) * scaleY,
    })),
  }
}

/**
 * Owns all persistent canvas object mutations. Every public operation produces
 * one Yjs undo item, including batch layout and clipboard actions.
 */
export function useCanvasElements(options: UseCanvasElementsOptions) {
  function withGesture(callback: Parameters<typeof runCanvasGesture>[2]): boolean {
    const ydoc = options.getYDoc()
    if (!ydoc) return false
    runCanvasGesture(ydoc, options.getUndoManager(), callback)
    return true
  }

  function updateElement(id: string, patch: CanvasElementPatch): boolean {
    const ydoc = options.getYDoc()
    if (!ydoc) return false
    const element = getCanvasSharedTypes(ydoc).elements.get(id)
    if (!element || element.locked && patch.locked !== false) return false
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements }) => {
      const current = elements.get(id)
      if (!current) return
      elements.set(id, applyElementPatch(current, patch))
      reflowBoundConnectors(ydoc, id)
    })
    return true
  }

  function updateElements(patches: Readonly<Record<string, CanvasElementPatch>>) {
    const ydoc = options.getYDoc()
    if (!ydoc) return
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements }) => {
      for (const [id, patch] of Object.entries(patches)) {
        const current = elements.get(id)
        if (!current || current.locked && patch.locked !== false) continue
        elements.set(id, applyElementPatch(current, patch))
        reflowBoundConnectors(ydoc, id)
      }
    })
  }

  function moveElement(id: string, x: number, y: number) {
    updateElement(id, { x, y })
  }

  function resizeElement(id: string, width: number, height: number) {
    updateElement(id, {
      width: Math.max(24, Math.min(20_000, width)),
      height: Math.max(24, Math.min(20_000, height)),
    })
  }

  function moveElements(ids: readonly string[], delta: CanvasPoint) {
    const ydoc = options.getYDoc()
    if (!ydoc) return
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements }) => {
      for (const id of ids) {
        const element = elements.get(id)
        if (!element || element.locked) continue
        elements.set(id, applyElementPatch(element, { x: element.x + delta.x, y: element.y + delta.y }))
        reflowBoundConnectors(ydoc, id)
      }
    })
  }

  function addShape(
    x: number,
    y: number,
    shape: CanvasShapeElement['shape'] = 'rectangle',
    bounds: Partial<CanvasBounds> = {},
    style?: CanvasElementStyle,
  ): string {
    const ydoc = options.getYDoc()
    if (!ydoc) return ''
    const id = createElementId()
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, order }) => {
      elements.set(id, {
        id,
        kind: 'shape',
        shape,
        x: bounds.x ?? x,
        y: bounds.y ?? y,
        width: bounds.width ?? 220,
        height: bounds.height ?? 140,
        zIndex: nextElementZIndex(elements),
        style: style ?? { fill: '#8b5cf622', stroke: '#8b5cf6', strokeWidth: 2 },
      })
      order.push([id])
    })
    return id
  }

  function addTextElement(x: number, y: number, text = '', bounds: Partial<CanvasBounds> = {}): string {
    const ydoc = options.getYDoc()
    if (!ydoc) return ''
    const id = createElementId()
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, order }) => {
      elements.set(id, {
        id,
        kind: 'text',
        text,
        x: bounds.x ?? x,
        y: bounds.y ?? y,
        width: bounds.width ?? 220,
        height: bounds.height ?? 60,
        zIndex: nextElementZIndex(elements),
        style: { fontSize: 16, textAlign: 'left' },
      })
      order.push([id])
    })
    return id
  }

  function addStroke(kind: 'freehand' | 'highlighter', points: CanvasPoint[], style?: CanvasElementStyle): string {
    const ydoc = options.getYDoc()
    if (!ydoc || points.length < 2) return ''
    const id = createElementId()
    const bounds = strokeBounds(points)
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, order }) => {
      elements.set(id, {
        id,
        kind,
        points,
        ...bounds,
        zIndex: nextElementZIndex(elements),
        style: style ?? (kind === 'highlighter'
          ? { stroke: '#facc15', strokeWidth: 14, opacity: 0.45 }
          : { stroke: '#171717', strokeWidth: 3, opacity: 1 }),
      })
      order.push([id])
    })
    return id
  }

  function addImageElement(src: string, alt: string, bounds: CanvasBounds): string {
    const ydoc = options.getYDoc()
    if (!ydoc || !src) return ''
    const id = createElementId()
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, order }) => {
      elements.set(id, {
        id,
        kind: 'image',
        src,
        alt,
        ...bounds,
        zIndex: nextElementZIndex(elements),
      })
      order.push([id])
    })
    return id
  }

  function addConnector(connector: Omit<CanvasConnector, 'id' | 'zIndex'>): string {
    const ydoc = options.getYDoc()
    if (!ydoc) return ''
    const id = createElementId()
    runCanvasGesture(ydoc, options.getUndoManager(), ({ connectors, order }) => {
      connectors.set(id, { ...connector, id, zIndex: order.length })
      order.push([id])
    })
    return id
  }

  function updateConnector(id: string, patch: Partial<Omit<CanvasConnector, 'id'>>) {
    withGesture(({ connectors }) => {
      const connector = connectors.get(id)
      if (connector) connectors.set(id, { ...connector, ...patch })
    })
  }

  function deleteCanvasItem(id: string): boolean {
    const ydoc = options.getYDoc()
    if (!ydoc) return false
    const types = getCanvasSharedTypes(ydoc)
    if (!types.elements.has(id) && !types.connectors.has(id)) return false
    runCanvasGesture(ydoc, options.getUndoManager(), (shared) => {
      if (shared.connectors.has(id)) shared.connectors.delete(id)
      if (shared.elements.has(id)) {
        shared.elements.delete(id)
        for (const [connectorId, connector] of shared.connectors.entries()) {
          const fromTarget = connector.from.binding?.target === 'element' && connector.from.binding.targetId === id
          const toTarget = connector.to.binding?.target === 'element' && connector.to.binding.targetId === id
          if (fromTarget || toTarget) {
            shared.connectors.set(connectorId, {
              ...connector,
              from: fromTarget ? { x: connector.from.x, y: connector.from.y } : connector.from,
              to: toTarget ? { x: connector.to.x, y: connector.to.y } : connector.to,
            })
          }
        }
      }
      const index = shared.order.toArray().indexOf(id)
      if (index >= 0) shared.order.delete(index, 1)
    })
    return true
  }

  function deleteCanvasItems(ids: readonly string[]) {
    const ydoc = options.getYDoc()
    if (!ydoc) return
    const targets = new Set(ids)
    runCanvasGesture(ydoc, options.getUndoManager(), (shared) => {
      for (const id of targets) {
        shared.elements.delete(id)
        shared.connectors.delete(id)
      }
      for (const [connectorId, connector] of shared.connectors.entries()) {
        const fromTarget = connector.from.binding?.target === 'element' && targets.has(connector.from.binding.targetId)
        const toTarget = connector.to.binding?.target === 'element' && targets.has(connector.to.binding.targetId)
        if (fromTarget || toTarget) {
          shared.connectors.set(connectorId, {
            ...connector,
            from: fromTarget ? { x: connector.from.x, y: connector.from.y } : connector.from,
            to: toTarget ? { x: connector.to.x, y: connector.to.y } : connector.to,
          })
        }
      }
      rewriteOrder(shared.order, shared.order.toArray().filter(id => !targets.has(id)))
    })
  }

  function deleteElement(id: string): boolean {
    return deleteCanvasItem(id)
  }

  function patchStyle(ids: readonly string[], patch: CanvasElementStyle) {
    const ydoc = options.getYDoc()
    if (!ydoc) return
    // fontSize/fontFamily changes resize text elements to fit their content;
    // that box is content-derived, so a later text or font change supersedes
    // any size this patch computes here (and shapes keep their own box).
    const resizesText = 'fontSize' in patch || 'fontFamily' in patch
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements }) => {
      for (const id of ids) {
        const element = elements.get(id)
        if (!element || element.locked) continue
        const style = { ...element.style, ...patch }
        if (element.kind === 'text' && resizesText) {
          const { width, height } = textElementSize(element.text, style)
          elements.set(id, { ...element, style, width, height })
          reflowBoundConnectors(ydoc, id)
        } else {
          elements.set(id, { ...element, style })
        }
      }
    })
  }

  function setText(id: string, text: string) {
    const ydoc = options.getYDoc()
    if (!ydoc) return
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, connectors }) => {
      const element = elements.get(id)
      // Text elements are content-sized: any prior manual resize is
      // superseded here, matching the intended "grows with content" behavior.
      if (element?.kind === 'text') {
        const { width, height } = textElementSize(text, element.style ?? {})
        elements.set(id, { ...element, text, width, height })
        reflowBoundConnectors(ydoc, id)
      } else if (element?.kind === 'shape') {
        elements.set(id, { ...element, text })
      }
      const connector = connectors.get(id)
      if (connector) connectors.set(id, { ...connector, label: text })
    })
  }

  function setLocked(ids: readonly string[], locked: boolean) {
    updateElements(Object.fromEntries(ids.map(id => [id, { locked }])))
  }

  function setRotation(ids: readonly string[], rotation: number) {
    updateElements(Object.fromEntries(ids.map(id => [id, { rotation }])))
  }

  function setGroup(ids: readonly string[], grouped: boolean): string {
    const groupId = grouped ? createElementId() : ''
    updateElements(Object.fromEntries(ids.map(id => [id, { groupId: grouped ? groupId : undefined }])))
    return groupId
  }

  function arrange(ids: readonly string[], direction: 'front' | 'back' | 'forward' | 'backward') {
    const ydoc = options.getYDoc()
    if (!ydoc) return
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, connectors, order }) => {
      const selected = new Set(ids)
      const current = order.toArray()
      let next = [...current]
      if (direction === 'front') next = [...current.filter(id => !selected.has(id)), ...current.filter(id => selected.has(id))]
      if (direction === 'back') next = [...current.filter(id => selected.has(id)), ...current.filter(id => !selected.has(id))]
      if (direction === 'forward') {
        for (let index = next.length - 2; index >= 0; index--) {
          if (selected.has(next[index]) && !selected.has(next[index + 1])) [next[index], next[index + 1]] = [next[index + 1], next[index]]
        }
      }
      if (direction === 'backward') {
        for (let index = 1; index < next.length; index++) {
          if (selected.has(next[index]) && !selected.has(next[index - 1])) [next[index], next[index - 1]] = [next[index - 1], next[index]]
        }
      }
      rewriteOrder(order, next)
      next.forEach((id, zIndex) => {
        const element = elements.get(id)
        if (element) elements.set(id, { ...element, zIndex })
        const connector = connectors.get(id)
        if (connector) connectors.set(id, { ...connector, zIndex })
      })
    })
  }

  function align(ids: readonly string[], alignment: CanvasAlignment) {
    const ydoc = options.getYDoc()
    if (!ydoc) return
    const types = getCanvasSharedTypes(ydoc)
    const selected = ids.flatMap(id => types.elements.get(id) ? [types.elements.get(id)!] : [])
    const positions = alignElements(selected, alignment)
    updateElements(positions)
  }

  function distribute(ids: readonly string[], direction: CanvasDistribution) {
    const ydoc = options.getYDoc()
    if (!ydoc) return
    const types = getCanvasSharedTypes(ydoc)
    const selected = ids.flatMap(id => types.elements.get(id) ? [types.elements.get(id)!] : [])
    updateElements(distributeElements(selected, direction))
  }

  function insertClipboard(payload: CanvasClipboardPayload, offset: CanvasPoint = { x: 24, y: 24 }): string[] {
    const ydoc = options.getYDoc()
    if (!ydoc) return []
    const idMap = new Map(payload.elements.map(element => [element.id, createElementId()]))
    const connectorIdMap = new Map(payload.connectors.map(connector => [connector.id, createElementId()]))
    const groupIdMap = new Map(
      payload.elements.flatMap(element => element.groupId ? [element.groupId] : [])
        .map(groupId => [groupId, createElementId()]),
    )
    const inserted: string[] = []
    runCanvasGesture(ydoc, options.getUndoManager(), ({ elements, connectors, order }) => {
      for (const source of payload.elements) {
        const id = idMap.get(source.id)!
        const groupId = source.groupId ? groupIdMap.get(source.groupId) : undefined
        const element = applyElementPatch(structuredClone(source), {
          x: source.x + offset.x,
          y: source.y + offset.y,
        })
        const insertedElement = {
          ...element,
          id,
          zIndex: nextElementZIndex(elements),
          ...(groupId ? { groupId } : {}),
        }
        elements.set(id, insertedElement)
        order.push([id])
        inserted.push(id)
      }
      for (const source of payload.connectors) {
        const id = connectorIdMap.get(source.id)!
        const remapEndpoint = (endpoint: CanvasConnector['from']) => ({
          ...endpoint,
          x: endpoint.x + offset.x,
          y: endpoint.y + offset.y,
          ...(endpoint.binding?.target === 'element' && idMap.has(endpoint.binding.targetId)
            ? { binding: { ...endpoint.binding, targetId: idMap.get(endpoint.binding.targetId)! } }
            : { binding: undefined }),
        })
        connectors.set(id, {
          ...structuredClone(source),
          id,
          from: remapEndpoint(source.from),
          to: remapEndpoint(source.to),
          zIndex: order.length,
        })
        order.push([id])
        inserted.push(id)
      }
    })
    return inserted
  }

  return {
    moveElement,
    moveElements,
    resizeElement,
    updateElement,
    updateElements,
    addShape,
    addTextElement,
    addStroke,
    addImageElement,
    addConnector,
    updateConnector,
    deleteElement,
    deleteCanvasItem,
    deleteCanvasItems,
    patchStyle,
    setText,
    setLocked,
    setRotation,
    setGroup,
    arrange,
    align,
    distribute,
    insertClipboard,
  }
}
