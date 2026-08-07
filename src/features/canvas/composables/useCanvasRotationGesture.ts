import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import type { CanvasCamera, CanvasElement } from '../../../core/canvas'

interface UseCanvasRotationGestureOptions {
  camera: CanvasCamera
  viewport: Ref<HTMLElement | null>
  elements: Ref<Record<string, CanvasElement>>
  drafts: Record<string, Partial<CanvasElement>>
  updateElement: (id: string, patch: Partial<CanvasElement>) => boolean
}

export function useCanvasRotationGesture(options: UseCanvasRotationGestureOptions) {
  let gesture: { id: string; pointerId: number } | null = null

  function onRotatePointerDown(id: string, event: PointerEvent) {
    if (!options.elements.value[id] || options.elements.value[id].locked) return
    gesture = { id, pointerId: event.pointerId }
    options.viewport.value?.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function rotationAt(event: PointerEvent, element: CanvasElement): number | null {
    const rect = options.viewport.value?.getBoundingClientRect()
    if (!rect) return null
    const centerX = (element.x + element.width / 2 - options.camera.x) * options.camera.zoom + rect.left
    const centerY = (element.y + element.height / 2 - options.camera.y) * options.camera.zoom + rect.top
    let angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + 90
    if (event.shiftKey) angle = Math.round(angle / 15) * 15
    return Math.round(angle * 10) / 10
  }

  function onPointerMove(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const element = options.elements.value[gesture.id]
    const rotation = element ? rotationAt(event, element) : null
    if (rotation !== null) options.drafts[gesture.id] = { ...options.drafts[gesture.id], rotation }
  }

  function onPointerUp(event: PointerEvent) {
    if (!gesture || gesture.pointerId !== event.pointerId) return
    const draft = options.drafts[gesture.id]
    if (draft?.rotation !== undefined) options.updateElement(gesture.id, { rotation: draft.rotation })
    delete options.drafts[gesture.id]
    gesture = null
  }

  function cancel() {
    if (gesture) delete options.drafts[gesture.id]
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

  return { onRotatePointerDown, cancel }
}
