import { onBeforeUnmount, onMounted, reactive, type Ref } from 'vue'
import {
  bindConnectorEndpoint,
  screenToWorld,
  type CanvasBounds,
  type CanvasCamera,
  type CanvasConnector,
  type CanvasSnapshotV1,
} from '../../../core/canvas'

interface UseCanvasConnectorGesturesOptions {
  snapshot: Ref<CanvasSnapshotV1>
  effectiveFrame: Ref<CanvasBounds>
  camera: CanvasCamera
  viewport: Ref<HTMLElement | null>
  updateConnector: (id: string, patch: Partial<Omit<CanvasConnector, 'id'>>) => void
}

export function useCanvasConnectorGestures(options: UseCanvasConnectorGesturesOptions) {
  const drafts = reactive<Record<string, Partial<CanvasConnector>>>({})
  let gesture: { id: string; endpoint: 'from' | 'to'; pointerId: number } | null = null

  function onEndpointPointerDown(id: string, endpoint: 'from' | 'to', event: PointerEvent) {
    gesture = { id, endpoint, pointerId: event.pointerId }
    options.viewport.value?.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function endpointAt(event: PointerEvent) {
    const rect = options.viewport.value?.getBoundingClientRect()
    if (!rect) return null
    const point = screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, options.camera)
    return bindConnectorEndpoint(
      point,
      options.snapshot.value.elements,
      options.effectiveFrame.value,
      16 / options.camera.zoom,
    )
  }

  function onPointerMove(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const endpoint = endpointAt(event)
    if (endpoint) drafts[gesture.id] = { ...drafts[gesture.id], [gesture.endpoint]: endpoint }
  }

  function onPointerUp(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const draft = drafts[gesture.id]
    if (draft) options.updateConnector(gesture.id, draft)
    delete drafts[gesture.id]
    gesture = null
  }

  function cancel() {
    if (gesture) delete drafts[gesture.id]
    gesture = null
  }

  onMounted(() => {
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  })

  return { drafts, onEndpointPointerDown, cancel }
}
