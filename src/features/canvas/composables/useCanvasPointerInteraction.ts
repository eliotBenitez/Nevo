import { computed, onBeforeUnmount, onMounted, shallowRef, type Ref } from 'vue'
import type { EditorView } from 'prosemirror-view'
import {
  CANVAS_DOCUMENT_FRAME_ID,
  intersects,
  screenToWorld,
  snapValue,
  unionBounds,
  type CanvasBounds,
  type CanvasCamera,
  type CanvasElement,
  type CanvasPoint,
  type CanvasSnapshotV1,
} from '../../../core/canvas'
import { createWheelGestureClassifier, wheelDeltaToPixels } from '../wheelGesture'

const WHEEL_ZOOM_IN = 1.1
const WHEEL_ZOOM_OUT = 0.9

interface CanvasPointerActions {
  moveFrame: (x: number, y: number) => void
  previewFrame: (patch: Partial<Pick<CanvasBounds, 'x' | 'y' | 'width' | 'height'>>) => void
  resizeFrame: (width: number, height: number) => void
  moveElement: (id: string, x: number, y: number) => void
  resizeElement: (id: string, width: number, height: number) => void
  updateElements?: (patches: Readonly<Record<string, Partial<CanvasBounds>>>) => void
  cancelPreviewFrame?: () => void
}

interface UseCanvasPointerInteractionOptions {
  snapshot: Ref<CanvasSnapshotV1>
  camera: CanvasCamera
  /** Reactive render copy of `camera` (see `useCanvasCamera`). Used only by
   *  `selectionChromeStyle`/`marqueeStyle` below so they invalidate on pan/zoom —
   *  `camera` itself is a plain object and never triggers Vue reactivity. */
  cameraView: CanvasCamera
  /** Frame bounds with auto-height/collapsed resolution applied (see
   *  `effectiveFrameBounds`). The stored `snapshot.frame` is stale for
   *  auto-height and collapsed frames, so hit-testing against it alone would
   *  select/marquee against the wrong rectangle. */
  effectiveFrame: Ref<CanvasBounds>
  viewport: Ref<HTMLDivElement | null>
  selectedIds: Ref<string[]>
  spacePressed: Ref<boolean>
  marquee: Ref<CanvasBounds | null>
  /** In-flight element edits, keyed by id. Carries rotation as well as bounds:
   *  `useCanvasRotationGesture` writes the live angle here during a drag. */
  elementDrafts: Record<string, Partial<CanvasElement>>
  actions: CanvasPointerActions
  getEditorView: () => EditorView | null
  panBy: (delta: CanvasPoint) => void
  zoomAt: (point: CanvasPoint, zoom: number) => void
  publishSelection: (ids: string[]) => void
  publishCursor: (ids: string[], point: CanvasPoint) => void
}

export function useCanvasPointerInteraction(options: UseCanvasPointerInteractionOptions) {
  // Cached viewport rect avoids a synchronous layout read (getBoundingClientRect) on every
  // pointermove; the viewport is `inset: 0` so its rect only changes on resize/scroll.
  let viewportRect: DOMRect | null = null
  let cursorFrame: number | null = null
  let pendingCursorPoint: CanvasPoint | null = null
  const wheelGesture = createWheelGestureClassifier()
  const alignmentGuides = shallowRef<Array<{ axis: 'x' | 'y'; value: number }>>([])

  function refreshViewportRect() {
    viewportRect = options.viewport.value?.getBoundingClientRect() ?? null
  }

  function flushCursor() {
    cursorFrame = null
    if (pendingCursorPoint) options.publishCursor(options.selectedIds.value, pendingCursorPoint)
    pendingCursorPoint = null
  }

  function queueCursorPublish(point: CanvasPoint) {
    pendingCursorPoint = point
    if (cursorFrame !== null) return
    cursorFrame = requestAnimationFrame(flushCursor)
  }

  let dragging: {
    kind: 'pan' | 'marquee' | 'frame' | 'element' | 'resize'
    pointerId: number
    start: CanvasPoint
    itemId?: string
    positionStart?: CanvasPoint
    sizeStart?: CanvasPoint
    worldStart?: CanvasPoint
    itemKind?: 'frame' | 'element'
    positions?: Record<string, CanvasPoint>
    aspectRatio?: number
  } | null = null

  const selectedItem = computed(() => {
    const elementItems = options.selectedIds.value.flatMap((id) => {
      const element = options.snapshot.value.elements[id]
      return element ? [element] : []
    })
    if (elementItems.length > 1) {
      const bounds = unionBounds(elementItems)
      return bounds ? { id: '', kind: 'elements' as const, bounds, locked: elementItems.every(element => element.locked) } : null
    }
    const id = options.selectedIds.value.length === 1 ? options.selectedIds.value[0] : ''
    if (!id) return null
    if (id === CANVAS_DOCUMENT_FRAME_ID) {
      return { id, kind: 'frame' as const, bounds: options.effectiveFrame.value, locked: options.snapshot.value.frame.locked }
    }
    const element = options.snapshot.value.elements[id]
    if (element) return { id, kind: 'element' as const, bounds: element, locked: element.locked }
    return null
  })

  const selectionChromeStyle = computed(() => {
    const item = selectedItem.value
    if (!item || item.kind === 'frame') return {}
    const selected = item.kind === 'element'
      ? [{ ...item.bounds, ...options.elementDrafts[item.id] }]
      : options.selectedIds.value.flatMap((id) => {
          const element = options.snapshot.value.elements[id]
          return element ? [{ ...element, ...options.elementDrafts[id] }] : []
        })
    const bounds = unionBounds(selected)
    if (!bounds) return {}
    // A single element's chrome rotates with it, using the same centre-origin
    // rotation the SVG layer applies to the shape itself. A multi-selection
    // keeps its axis-aligned union box — there is no single angle to follow.
    const rotation = item.kind === 'element' ? selected[0].rotation ?? 0 : 0
    return {
      left: `${(bounds.x - options.cameraView.x) * options.cameraView.zoom}px`,
      top: `${(bounds.y - options.cameraView.y) * options.cameraView.zoom}px`,
      width: `${bounds.width * options.cameraView.zoom}px`,
      height: `${bounds.height * options.cameraView.zoom}px`,
      ...(rotation ? { transform: `rotate(${rotation}deg)`, transformOrigin: 'center' } : {}),
    }
  })

  const marqueeStyle = computed(() => {
    const bounds = options.marquee.value
    if (!bounds) return {}
    return {
      left: `${(bounds.x - options.cameraView.x) * options.cameraView.zoom}px`,
      top: `${(bounds.y - options.cameraView.y) * options.cameraView.zoom}px`,
      width: `${bounds.width * options.cameraView.zoom}px`,
      height: `${bounds.height * options.cameraView.zoom}px`,
    }
  })

  function select(id: string, additive = false) {
    const element = options.snapshot.value.elements[id]
    const groupedIds = element?.groupId
      ? Object.values(options.snapshot.value.elements).filter(candidate => candidate.groupId === element.groupId).map(candidate => candidate.id)
      : [id]
    if (additive) {
      options.selectedIds.value = options.selectedIds.value.includes(id)
        ? options.selectedIds.value.filter(value => !groupedIds.includes(value))
        : Array.from(new Set([...options.selectedIds.value, ...groupedIds]))
    } else {
      options.selectedIds.value = groupedIds
    }
    options.publishSelection(options.selectedIds.value)
  }

  function onBackgroundPointerDown(event: PointerEvent) {
    if (event.button !== 0 && event.button !== 1) return
    if (event.target !== options.viewport.value) return
    const kind = event.button === 1 || options.spacePressed.value ? 'pan' : 'marquee'
    refreshViewportRect()
    const rect = viewportRect
    if (!rect) return
    const worldStart = screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, options.camera)
    dragging = {
      kind,
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      worldStart,
    }
    options.viewport.value?.setPointerCapture(event.pointerId)
    if (kind === 'marquee') {
      options.marquee.value = { ...worldStart, width: 0, height: 0 }
      if (!event.shiftKey) options.selectedIds.value = []
    }
    event.preventDefault()
  }

  function onFrameHeaderPointerDown(event: PointerEvent) {
    if (event.button !== 0) return
    select(CANVAS_DOCUMENT_FRAME_ID, event.shiftKey)
    const frame = options.snapshot.value.frame
    if (frame.locked) return
    dragging = {
      kind: 'frame',
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      itemId: CANVAS_DOCUMENT_FRAME_ID,
      positionStart: { x: frame.x, y: frame.y },
    }
    ;(event.currentTarget as HTMLElement | null)?.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function onElementPointerDown(id: string, event: PointerEvent) {
    if (event.button !== 0) return
    const element = options.snapshot.value.elements[id]
    if (!element) return
    if (event.shiftKey) {
      select(id, true)
      if (!options.selectedIds.value.includes(id)) return
    } else if (!options.selectedIds.value.includes(id)) {
      select(id)
    }
    if (element.locked) return
    const movableIds = options.selectedIds.value.filter(selectedId => {
      const selected = options.snapshot.value.elements[selectedId]
      return selected && !selected.locked
    })
    dragging = {
      kind: 'element',
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      itemId: id,
      positionStart: { x: element.x, y: element.y },
      positions: Object.fromEntries(movableIds.map(selectedId => {
        const selected = options.snapshot.value.elements[selectedId]!
        return [selectedId, { x: selected.x, y: selected.y }]
      })),
    }
    options.viewport.value?.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function onResizePointerDown(event: PointerEvent) {
    const item = selectedItem.value
    if (!item || item.locked || item.kind === 'elements') return
    // A collapsed frame has a fixed size (see `effectiveFrameBounds`); its
    // resize handle is already hidden in the chrome, but pointer input can
    // still race a collapse toggle, so refuse to start a drag here too.
    if (item.kind === 'frame' && options.snapshot.value.frame.collapsed) return
    const resizeElement = item.kind === 'element' ? options.snapshot.value.elements[item.id] : undefined
    dragging = {
      kind: 'resize',
      pointerId: event.pointerId,
      start: { x: event.clientX, y: event.clientY },
      itemId: item.id,
      sizeStart: { x: item.bounds.width, y: item.bounds.height },
      itemKind: item.kind,
      aspectRatio: resizeElement ? resizeElement.width / resizeElement.height : undefined,
    }
    options.viewport.value?.setPointerCapture(event.pointerId)
    event.stopPropagation()
    event.preventDefault()
  }

  function onPointerMove(event: PointerEvent) {
    const rect = viewportRect
    if (rect) {
      queueCursorPublish(screenToWorld({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      }, options.camera))
    }
    if (!dragging || dragging.pointerId !== event.pointerId) return
    const delta = { x: event.clientX - dragging.start.x, y: event.clientY - dragging.start.y }
    if (dragging.kind === 'pan') {
      options.panBy(delta)
      dragging.start = { x: event.clientX, y: event.clientY }
      return
    }
    if (dragging.kind === 'marquee' && dragging.worldStart && rect) {
      const point = screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, options.camera)
      options.marquee.value = {
        x: Math.min(dragging.worldStart.x, point.x),
        y: Math.min(dragging.worldStart.y, point.y),
        width: Math.abs(point.x - dragging.worldStart.x),
        height: Math.abs(point.y - dragging.worldStart.y),
      }
      return
    }
    if (dragging.kind === 'resize') {
      if (dragging.itemKind === 'element' && dragging.itemId && dragging.sizeStart) {
        const width = Math.max(24, dragging.sizeStart.x + delta.x / options.camera.zoom)
        const element = options.snapshot.value.elements[dragging.itemId]
        const preserveRatio = element?.kind === 'image' || event.shiftKey
        options.elementDrafts[dragging.itemId] = {
          width,
          height: preserveRatio && dragging.aspectRatio
            ? Math.max(24, width / dragging.aspectRatio)
            : Math.max(24, dragging.sizeStart.y + delta.y / options.camera.zoom),
        }
        return
      }
      if (!dragging.sizeStart) return
      options.actions.previewFrame({
        width: Math.max(120, dragging.sizeStart.x + delta.x / options.camera.zoom),
        height: Math.max(48, dragging.sizeStart.y + delta.y / options.camera.zoom),
      })
      return
    }
    if (dragging.kind === 'element' && dragging.itemId && dragging.positionStart) {
      const desired = {
        x: dragging.positionStart.x + delta.x / options.camera.zoom,
        y: dragging.positionStart.y + delta.y / options.camera.zoom,
      }
      const snapped = snapPosition(dragging.itemId, desired, event.altKey)
      const offset = { x: snapped.x - dragging.positionStart.x, y: snapped.y - dragging.positionStart.y }
      for (const [id, position] of Object.entries(dragging.positions ?? {})) {
        options.elementDrafts[id] = { x: position.x + offset.x, y: position.y + offset.y }
      }
      return
    }
    if (dragging.kind === 'frame' && dragging.positionStart) {
      options.actions.previewFrame({
        x: dragging.positionStart.x + delta.x / options.camera.zoom,
        y: dragging.positionStart.y + delta.y / options.camera.zoom,
      })
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (!dragging || dragging.pointerId !== event.pointerId) return
    if (dragging.kind === 'marquee' && options.marquee.value) {
      const marquee = options.marquee.value
      const ids = [
        ...(intersects(options.effectiveFrame.value, marquee) ? [CANVAS_DOCUMENT_FRAME_ID] : []),
        ...Object.values(options.snapshot.value.elements).filter(item => intersects(item, marquee)).map(item => item.id),
        ...Object.values(options.snapshot.value.connectors).filter((connector) => {
          const bounds = {
            x: Math.min(connector.from.x, connector.to.x),
            y: Math.min(connector.from.y, connector.to.y),
            width: Math.max(1, Math.abs(connector.to.x - connector.from.x)),
            height: Math.max(1, Math.abs(connector.to.y - connector.from.y)),
          }
          return intersects(bounds, marquee)
        }).map(connector => connector.id),
      ]
      options.selectedIds.value = event.shiftKey
        ? Array.from(new Set([...options.selectedIds.value, ...ids]))
        : ids
      options.marquee.value = null
    } else if (dragging.kind === 'frame' && dragging.positionStart) {
      options.actions.moveFrame(
        dragging.positionStart.x + (event.clientX - dragging.start.x) / options.camera.zoom,
        dragging.positionStart.y + (event.clientY - dragging.start.y) / options.camera.zoom,
      )
    } else if (dragging.kind === 'element' && dragging.itemId && dragging.positionStart) {
      const patches: Record<string, Partial<CanvasBounds>> = {}
      for (const id of Object.keys(dragging.positions ?? {})) {
        const draft = options.elementDrafts[id]
        if (draft) patches[id] = draft
        delete options.elementDrafts[id]
      }
      if (options.actions.updateElements) options.actions.updateElements(patches)
      else {
        for (const [id, patch] of Object.entries(patches)) {
          if (patch.x !== undefined && patch.y !== undefined) options.actions.moveElement(id, patch.x, patch.y)
        }
      }
    } else if (dragging.kind === 'resize' && dragging.sizeStart) {
      const width = dragging.sizeStart.x + (event.clientX - dragging.start.x) / options.camera.zoom
      const element = dragging.itemId ? options.snapshot.value.elements[dragging.itemId] : null
      const height = (element?.kind === 'image' || event.shiftKey) && dragging.aspectRatio
        ? width / dragging.aspectRatio
        : dragging.sizeStart.y + (event.clientY - dragging.start.y) / options.camera.zoom
      if (dragging.itemKind === 'element' && dragging.itemId) {
        options.actions.resizeElement(dragging.itemId, width, height)
        delete options.elementDrafts[dragging.itemId]
      } else {
        options.actions.resizeFrame(width, height)
      }
    }
    alignmentGuides.value = []
    dragging = null
  }

  function cancelGesture() {
    dragging = null
    options.marquee.value = null
    alignmentGuides.value = []
    for (const id of Object.keys(options.elementDrafts)) delete options.elementDrafts[id]
    options.actions.cancelPreviewFrame?.()
  }

  function snapPosition(id: string, desired: CanvasPoint, bypass: boolean): CanvasPoint {
    if (bypass) {
      alignmentGuides.value = []
      return desired
    }
    const element = options.snapshot.value.elements[id]
    if (!element) return desired
    const threshold = 6 / options.camera.zoom
    let x = snapValue(desired.x, 24, threshold)
    let y = snapValue(desired.y, 24, threshold)
    const movingX = [desired.x, desired.x + element.width / 2, desired.x + element.width]
    const movingY = [desired.y, desired.y + element.height / 2, desired.y + element.height]
    const xTargets: number[] = []
    const yTargets: number[] = []
    for (const candidate of Object.values(options.snapshot.value.elements)) {
      if (candidate.id === id || options.selectedIds.value.includes(candidate.id)) continue
      xTargets.push(candidate.x, candidate.x + candidate.width / 2, candidate.x + candidate.width)
      yTargets.push(candidate.y, candidate.y + candidate.height / 2, candidate.y + candidate.height)
    }
    alignmentGuides.value = []
    for (let movingIndex = 0; movingIndex < movingX.length; movingIndex++) {
      const target = xTargets.find(value => Math.abs(value - movingX[movingIndex]) <= threshold)
      if (target !== undefined) {
        x = desired.x + target - movingX[movingIndex]
        alignmentGuides.value.push({ axis: 'x', value: target })
        break
      }
    }
    for (let movingIndex = 0; movingIndex < movingY.length; movingIndex++) {
      const target = yTargets.find(value => Math.abs(value - movingY[movingIndex]) <= threshold)
      if (target !== undefined) {
        y = desired.y + target - movingY[movingIndex]
        alignmentGuides.value.push({ axis: 'y', value: target })
        break
      }
    }
    return { x, y }
  }

  // A mouse wheel zooms and a trackpad pans, both without modifiers; shift is
  // horizontal pan and ctrl/cmd forces zoom. See `wheelGesture.ts` for how the
  // two devices are told apart.
  //
  // The zoom step is a fixed factor per event rather than a function of
  // `deltaY`, because `deltaY` only means something together with `deltaMode`:
  // WebKitGTK reports DOM_DELTA_LINE with values of a few units, where a
  // magnitude-based curve resolves to a fraction of a percent per notch — a
  // zoom that appears not to work at all.
  function onWheel(event: WheelEvent) {
    if (event.deltaY === 0 && event.deltaX === 0) return
    const rect = viewportRect ?? options.viewport.value?.getBoundingClientRect() ?? null
    if (!rect) return
    event.preventDefault()

    if (event.shiftKey) {
      const amount = wheelDeltaToPixels(event.deltaY || event.deltaX, event.deltaMode)
      options.panBy({ x: -amount, y: 0 })
      return
    }
    if (wheelGesture.classify(event) === 'pan') {
      options.panBy({
        x: -wheelDeltaToPixels(event.deltaX, event.deltaMode),
        y: -wheelDeltaToPixels(event.deltaY, event.deltaMode),
      })
      return
    }
    const factor = event.deltaY < 0 ? WHEEL_ZOOM_IN : WHEEL_ZOOM_OUT
    options.zoomAt(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      options.camera.zoom * factor,
    )
  }

  onMounted(() => {
    refreshViewportRect()
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('resize', refreshViewportRect)
    window.addEventListener('scroll', refreshViewportRect, true)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
    window.removeEventListener('resize', refreshViewportRect)
    window.removeEventListener('scroll', refreshViewportRect, true)
    if (cursorFrame !== null) cancelAnimationFrame(cursorFrame)
    cursorFrame = null
    wheelGesture.dispose()
  })

  return {
    selectedItem,
    selectionChromeStyle,
    alignmentGuides,
    marqueeStyle,
    select,
    onBackgroundPointerDown,
    onFrameHeaderPointerDown,
    onElementPointerDown,
    onResizePointerDown,
    onWheel,
    cancelGesture,
    // The cached rect only tracks window resize/scroll; the pane can also
    // change size on its own (sidebar toggle, split view), which would anchor
    // zoom and drags to a stale origin. The view re-publishes it from its own
    // ResizeObserver.
    refreshViewportRect,
  }
}
