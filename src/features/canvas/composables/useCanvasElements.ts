import {
  alignElements,
  distributeElements,
  reflowConnectorBinding,
  textElementSize,
  type CanvasAlignment,
  type CanvasBounds,
  type CanvasClipboardPayload,
  type CanvasConnector,
  type CanvasDistribution,
  type CanvasDraft,
  type CanvasDraftOrder,
  type CanvasElement,
  type CanvasElementStyle,
  type CanvasPoint,
  type CanvasShapeElement,
  type CanvasStore,
} from '../../../core/canvas'
import { generateBlockId } from '../../../editor-core/plugins/blockIds'

interface UseCanvasElementsOptions {
  getStore: () => CanvasStore | null
}

type CanvasElementPatch = Partial<Omit<CanvasElement, 'id' | 'kind'>>

function reflowBoundConnectors(draft: CanvasDraft, id: string) {
  const element = draft.elements.get(id)
  if (!element) return
  for (const [connectorId, connector] of draft.connectors.entries()) {
    const next = reflowConnectorBinding(connector, 'element', id, element)
    if (next !== connector) draft.connectors.set(connectorId, next)
  }
}

function rewriteOrder(order: CanvasDraftOrder, ids: readonly string[]) {
  if (order.length) order.delete(0, order.length)
  if (ids.length) order.push([...ids])
}

function nextElementZIndex(elements: Map<string, CanvasElement>): number {
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
 * Owns all persistent canvas object mutations. Every public operation is one
 * `CanvasStore.commit()` call, i.e. one undo step.
 */
export function useCanvasElements(options: UseCanvasElementsOptions) {
  function withGesture(mutate: (draft: CanvasDraft) => void): boolean {
    const store = options.getStore()
    if (!store) return false
    store.commit(mutate)
    return true
  }

  function updateElement(id: string, patch: CanvasElementPatch): boolean {
    const store = options.getStore()
    if (!store) return false
    const element = store.snapshot.elements[id]
    if (!element || element.locked && patch.locked !== false) return false
    store.commit((draft) => {
      const current = draft.elements.get(id)
      if (!current) return
      draft.elements.set(id, applyElementPatch(current, patch))
      reflowBoundConnectors(draft, id)
    })
    return true
  }

  function updateElements(patches: Readonly<Record<string, CanvasElementPatch>>) {
    const store = options.getStore()
    if (!store) return
    store.commit((draft) => {
      for (const [id, patch] of Object.entries(patches)) {
        const current = draft.elements.get(id)
        if (!current || current.locked && patch.locked !== false) continue
        draft.elements.set(id, applyElementPatch(current, patch))
        reflowBoundConnectors(draft, id)
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
    const store = options.getStore()
    if (!store) return
    store.commit((draft) => {
      for (const id of ids) {
        const element = draft.elements.get(id)
        if (!element || element.locked) continue
        draft.elements.set(id, applyElementPatch(element, { x: element.x + delta.x, y: element.y + delta.y }))
        reflowBoundConnectors(draft, id)
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
    const store = options.getStore()
    if (!store) return ''
    const id = createElementId()
    store.commit(({ elements, order }) => {
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
    const store = options.getStore()
    if (!store) return ''
    const id = createElementId()
    store.commit(({ elements, order }) => {
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
    const store = options.getStore()
    if (!store || points.length < 2) return ''
    const id = createElementId()
    const bounds = strokeBounds(points)
    store.commit(({ elements, order }) => {
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
    const store = options.getStore()
    if (!store || !src) return ''
    const id = createElementId()
    store.commit(({ elements, order }) => {
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
    const store = options.getStore()
    if (!store) return ''
    const id = createElementId()
    store.commit(({ connectors, order }) => {
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
    const store = options.getStore()
    if (!store) return false
    if (!(id in store.snapshot.elements) && !(id in store.snapshot.connectors)) return false
    store.commit((draft) => {
      if (draft.connectors.has(id)) draft.connectors.delete(id)
      if (draft.elements.has(id)) {
        draft.elements.delete(id)
        for (const [connectorId, connector] of draft.connectors.entries()) {
          const fromTarget = connector.from.binding?.target === 'element' && connector.from.binding.targetId === id
          const toTarget = connector.to.binding?.target === 'element' && connector.to.binding.targetId === id
          if (fromTarget || toTarget) {
            draft.connectors.set(connectorId, {
              ...connector,
              from: fromTarget ? { x: connector.from.x, y: connector.from.y } : connector.from,
              to: toTarget ? { x: connector.to.x, y: connector.to.y } : connector.to,
            })
          }
        }
      }
      const index = draft.order.toArray().indexOf(id)
      if (index >= 0) draft.order.delete(index, 1)
    })
    return true
  }

  function deleteCanvasItems(ids: readonly string[]) {
    const store = options.getStore()
    if (!store) return
    const targets = new Set(ids)
    store.commit((draft) => {
      for (const id of targets) {
        draft.elements.delete(id)
        draft.connectors.delete(id)
      }
      for (const [connectorId, connector] of draft.connectors.entries()) {
        const fromTarget = connector.from.binding?.target === 'element' && targets.has(connector.from.binding.targetId)
        const toTarget = connector.to.binding?.target === 'element' && targets.has(connector.to.binding.targetId)
        if (fromTarget || toTarget) {
          draft.connectors.set(connectorId, {
            ...connector,
            from: fromTarget ? { x: connector.from.x, y: connector.from.y } : connector.from,
            to: toTarget ? { x: connector.to.x, y: connector.to.y } : connector.to,
          })
        }
      }
      rewriteOrder(draft.order, draft.order.toArray().filter(id => !targets.has(id)))
    })
  }

  function deleteElement(id: string): boolean {
    return deleteCanvasItem(id)
  }

  function patchStyle(ids: readonly string[], patch: CanvasElementStyle) {
    const store = options.getStore()
    if (!store) return
    // fontSize/fontFamily changes resize text elements to fit their content;
    // that box is content-derived, so a later text or font change supersedes
    // any size this patch computes here (and shapes keep their own box).
    const resizesText = 'fontSize' in patch || 'fontFamily' in patch
    store.commit((draft) => {
      for (const id of ids) {
        const element = draft.elements.get(id)
        if (!element || element.locked) continue
        const style = { ...element.style, ...patch }
        if (element.kind === 'text' && resizesText) {
          const { width, height } = textElementSize(element.text, style)
          draft.elements.set(id, { ...element, style, width, height })
          reflowBoundConnectors(draft, id)
        } else {
          draft.elements.set(id, { ...element, style })
        }
      }
    })
  }

  function setText(id: string, text: string) {
    const store = options.getStore()
    if (!store) return
    store.commit((draft) => {
      const element = draft.elements.get(id)
      // Text elements are content-sized: any prior manual resize is
      // superseded here, matching the intended "grows with content" behavior.
      if (element?.kind === 'text') {
        const { width, height } = textElementSize(text, element.style ?? {})
        draft.elements.set(id, { ...element, text, width, height })
        reflowBoundConnectors(draft, id)
      } else if (element?.kind === 'shape') {
        draft.elements.set(id, { ...element, text })
      }
      const connector = draft.connectors.get(id)
      if (connector) draft.connectors.set(id, { ...connector, label: text })
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
    const store = options.getStore()
    if (!store) return
    store.commit(({ elements, connectors, order }) => {
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
    const store = options.getStore()
    if (!store) return
    const selected = ids.flatMap(id => store.snapshot.elements[id] ? [store.snapshot.elements[id]] : [])
    const positions = alignElements(selected, alignment)
    updateElements(positions)
  }

  function distribute(ids: readonly string[], direction: CanvasDistribution) {
    const store = options.getStore()
    if (!store) return
    const selected = ids.flatMap(id => store.snapshot.elements[id] ? [store.snapshot.elements[id]] : [])
    updateElements(distributeElements(selected, direction))
  }

  function insertClipboard(payload: CanvasClipboardPayload, offset: CanvasPoint = { x: 24, y: 24 }): string[] {
    const store = options.getStore()
    if (!store) return []
    const idMap = new Map(payload.elements.map(element => [element.id, createElementId()]))
    const connectorIdMap = new Map(payload.connectors.map(connector => [connector.id, createElementId()]))
    const groupIdMap = new Map(
      payload.elements.flatMap(element => element.groupId ? [element.groupId] : [])
        .map(groupId => [groupId, createElementId()]),
    )
    const inserted: string[] = []
    store.commit(({ elements, connectors, order }) => {
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
