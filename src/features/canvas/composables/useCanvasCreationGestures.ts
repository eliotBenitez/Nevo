import { onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue'
import {
  appendStrokePoint,
  bindConnectorEndpoint,
  hitConnector,
  hitElement,
  resizeBounds,
  screenToWorld,
  type CanvasBounds,
  type CanvasCamera,
  type CanvasConnector,
  type CanvasElementStyle,
  type CanvasPoint,
  type CanvasShapeElement,
  type CanvasSnapshotV1,
} from '../../../core/canvas'
import { canvasToolShape, type CanvasTool, type CanvasToolStyle } from './useCanvasToolState'

export type CanvasCreationDraft =
  | { kind: 'shape'; shape: CanvasShapeElement['shape']; bounds: CanvasBounds; style: CanvasElementStyle }
  | { kind: 'text'; bounds: CanvasBounds }
  | { kind: 'frame'; bounds: CanvasBounds }
  | { kind: 'eraser'; point: CanvasPoint; radius: number }
  | { kind: 'stroke'; tool: 'freehand' | 'highlighter'; points: CanvasPoint[]; style: CanvasElementStyle }
  | { kind: 'connector'; connector: Omit<CanvasConnector, 'id' | 'zIndex'> }

interface CanvasCreationActions {
  addShape: (
    x: number,
    y: number,
    shape?: CanvasShapeElement['shape'],
    bounds?: Partial<CanvasBounds>,
    style?: CanvasElementStyle,
  ) => string
  addTextElement: (x: number, y: number, text?: string, bounds?: Partial<CanvasBounds>) => string
  addRichNote: (x: number, y: number, bounds?: Partial<CanvasBounds>) => string
  addFrame: (x: number, y: number, bounds?: Partial<CanvasBounds>, title?: string) => string
  addMindMapRoot: (x: number, y: number, text?: string) => string
  addStroke: (kind: 'freehand' | 'highlighter', points: CanvasPoint[], style?: CanvasElementStyle) => string
  addConnector: (connector: Omit<CanvasConnector, 'id' | 'zIndex'>) => string
  deleteCanvasItems: (ids: readonly string[]) => void
  eraseStrokeParts: (eraser: readonly CanvasPoint[], radius: number) => string[]
}

interface UseCanvasCreationGesturesOptions {
  activeTool: Ref<CanvasTool>
  toolStyle: Ref<CanvasToolStyle>
  snapshot: Ref<CanvasSnapshotV1>
  effectiveFrame: Ref<CanvasBounds>
  camera: CanvasCamera
  viewport: Ref<HTMLElement | null>
  actions: CanvasCreationActions
  select: (id: string) => void
  onEditText: (id: string) => void
  onEditRichText: (id: string) => void
  onRequestImage: (point: CanvasPoint) => void
  onRequestNoteLink: (point: CanvasPoint) => void
  returnToSelect: () => void
  frameTitle: string
}

export function useCanvasCreationGestures(options: UseCanvasCreationGesturesOptions) {
  const draft = shallowRef<CanvasCreationDraft | null>(null)
  const erasedIds = new Set<string>()
  const eraserTrail: CanvasPoint[] = []
  let pointerId: number | null = null
  let start: CanvasPoint | null = null

  function eventPoint(event: PointerEvent): CanvasPoint | null {
    const rect = options.viewport.value?.getBoundingClientRect()
    if (!rect) return null
    return screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, options.camera)
  }

  function eraseAt(point: CanvasPoint) {
    const element = Object.values(options.snapshot.value.elements)
      .filter(candidate => !candidate.locked && hitElement(point, candidate, 7 / options.camera.zoom))
      .sort((a, b) => b.zIndex - a.zIndex)[0]
    if (element && element.kind !== 'freehand' && element.kind !== 'highlighter') erasedIds.add(element.id)
    const connector = Object.values(options.snapshot.value.connectors)
      .filter(candidate => hitConnector(point, candidate.from, candidate.to, 8 / options.camera.zoom))
      .sort((a, b) => b.zIndex - a.zIndex)[0]
    if (connector) erasedIds.add(connector.id)
  }

  function onPointerDown(event: PointerEvent): boolean {
    const tool = options.activeTool.value
    if (tool === 'select' || tool === 'hand' || event.button !== 0) return false
    const point = eventPoint(event)
    if (!point) return false
    if (tool === 'image') {
      options.onRequestImage(point)
      return true
    }
    if (tool === 'note-link') {
      options.onRequestNoteLink(point)
      return true
    }
    if (tool === 'note') {
      const id = options.actions.addRichNote(point.x, point.y)
      if (id) {
        options.select(id)
        options.onEditRichText(id)
      }
      options.returnToSelect()
      return true
    }
    if (tool === 'mindmap') {
      const id = options.actions.addMindMapRoot(point.x - 110, point.y - 42)
      if (id) {
        options.select(id)
        options.onEditText(id)
      }
      options.returnToSelect()
      return true
    }
    pointerId = event.pointerId
    start = point
    options.viewport.value?.setPointerCapture(event.pointerId)
    const shape = canvasToolShape(tool)
    if (shape) {
      draft.value = { kind: 'shape', shape, bounds: { ...point, width: 1, height: 1 }, style: { ...options.toolStyle.value.element } }
    } else if (tool === 'text') {
      draft.value = { kind: 'text', bounds: { ...point, width: 1, height: 1 } }
    } else if (tool === 'frame') {
      draft.value = { kind: 'frame', bounds: { ...point, width: 1, height: 1 } }
    } else if (tool === 'pen' || tool === 'highlighter') {
      draft.value = {
        kind: 'stroke',
        tool: tool === 'pen' ? 'freehand' : 'highlighter',
        points: [{ ...point, pressure: event.pressure || 0.5 }],
        style: tool === 'pen'
          ? { stroke: options.toolStyle.value.element.stroke ?? '#171717', strokeWidth: options.toolStyle.value.element.strokeWidth ?? 3, opacity: 1 }
          : { stroke: '#facc15', strokeWidth: 14, opacity: 0.45 },
      }
    } else if (tool === 'connector') {
      const endpoint = bindConnectorEndpoint(point, options.snapshot.value.elements, options.effectiveFrame.value, 16 / options.camera.zoom)
      draft.value = {
        kind: 'connector',
        connector: {
          from: endpoint,
          to: { ...point },
          ...options.toolStyle.value.connector,
          routing: options.toolStyle.value.connector.routing ?? 'straight',
        },
      }
    } else if (tool === 'eraser') {
      erasedIds.clear()
      eraserTrail.splice(0, eraserTrail.length, point)
      draft.value = { kind: 'eraser', point, radius: 12 / options.camera.zoom }
      eraseAt(point)
    }
    event.preventDefault()
    return true
  }

  function onPointerMove(event: PointerEvent) {
    if (pointerId !== event.pointerId || !start) return
    const point = eventPoint(event)
    if (!point) return
    const current = draft.value
    if (current?.kind === 'shape' || current?.kind === 'text' || current?.kind === 'frame') {
      current.bounds = resizeBounds(start, point, { constrain: event.shiftKey, fromCenter: event.altKey })
      draft.value = { ...current }
    } else if (current?.kind === 'stroke') {
      for (const sample of event.getCoalescedEvents?.() ?? [event]) {
        const samplePoint = eventPoint(sample)
        if (samplePoint) appendStrokePoint(current.points, { ...samplePoint, pressure: sample.pressure || 0.5 })
      }
      draft.value = { ...current, points: [...current.points] }
    } else if (current?.kind === 'connector') {
      current.connector.to = bindConnectorEndpoint(
        point,
        options.snapshot.value.elements,
        options.effectiveFrame.value,
        16 / options.camera.zoom,
      )
      draft.value = { ...current, connector: { ...current.connector } }
    } else if (current?.kind === 'eraser') {
      eraserTrail.push(point)
      draft.value = { ...current, point }
      eraseAt(point)
    }
  }

  function finishGesture(event: PointerEvent) {
    if (pointerId !== event.pointerId || !start) return
    const current = draft.value
    let id = ''
    if (current?.kind === 'shape') {
      const bounds = current.bounds.width < 5 || current.bounds.height < 5
        ? { x: start.x - 90, y: start.y - 55, width: 180, height: 110 }
        : current.bounds
      id = options.actions.addShape(bounds.x, bounds.y, current.shape, bounds, current.style)
    } else if (current?.kind === 'text') {
      const bounds = current.bounds.width < 5 || current.bounds.height < 5
        ? { x: start.x, y: start.y, width: 220, height: 60 }
        : current.bounds
      id = options.actions.addTextElement(bounds.x, bounds.y, '', bounds)
    } else if (current?.kind === 'frame') {
      const bounds = current.bounds.width < 20 || current.bounds.height < 20
        ? { x: start.x - 480, y: start.y - 270, width: 960, height: 540 }
        : current.bounds
      id = options.actions.addFrame(bounds.x, bounds.y, bounds, options.frameTitle)
    } else if (current?.kind === 'stroke') {
      id = options.actions.addStroke(current.tool, current.points, current.style)
    } else if (current?.kind === 'connector') {
      id = options.actions.addConnector(current.connector)
    } else if (options.activeTool.value === 'eraser') {
      options.actions.eraseStrokeParts(eraserTrail, 12 / options.camera.zoom)
      if (erasedIds.size) options.actions.deleteCanvasItems([...erasedIds])
    }
    if (id) {
      options.select(id)
      if (current?.kind === 'text') options.onEditText(id)
    }
    const remainsActive = current?.kind === 'stroke' || options.activeTool.value === 'eraser'
    if (!remainsActive) options.returnToSelect()
    cancel()
  }

  function cancel() {
    draft.value = null
    erasedIds.clear()
    eraserTrail.splice(0)
    pointerId = null
    start = null
  }

  onMounted(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', finishGesture)
    window.addEventListener('pointercancel', cancel)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', finishGesture)
    window.removeEventListener('pointercancel', cancel)
  })

  return { draft, onPointerDown, cancel }
}
