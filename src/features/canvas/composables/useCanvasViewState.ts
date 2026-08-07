import { onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue'
import { screenToWorld, type CanvasBounds, type CanvasCamera, type CanvasElement, type CanvasPoint } from '../../../core/canvas'

/** Mutable canvas-view state (viewport, selection, drafts) shared with the gesture composables, plus viewport measurement. */
export function useCanvasViewState(camera: CanvasCamera) {
  const viewport = ref<HTMLDivElement | null>(null)
  const imageInput = ref<HTMLInputElement | null>(null)
  const viewportSize = reactive({ width: 1, height: 1 })
  const selectedIds = ref<string[]>([])
  const editingFrame = ref(false)
  const spacePressed = ref(false)
  const marquee = ref<CanvasBounds | null>(null)
  const elementDrafts = reactive<Record<string, Partial<CanvasElement>>>({})
  const insertionPoint = ref<CanvasPoint>({ x: 0, y: 0 })
  /** Bumped on every viewport resize. Consumers that cache viewport-derived
   *  geometry (the pointer composable's rect cache) watch this instead of being
   *  registered here, which would need a forward reference to a composable that
   *  is itself built on this state. */
  const viewportVersion = shallowRef(0)

  function viewportPoint(event: MouseEvent | DragEvent): CanvasPoint | null {
    const rect = viewport.value?.getBoundingClientRect()
    if (!rect) return null
    return screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top }, camera)
  }

  function updateViewportSize() {
    const rect = viewport.value?.getBoundingClientRect()
    if (!rect) return
    viewportSize.width = Math.max(1, rect.width)
    viewportSize.height = Math.max(1, rect.height)
    viewportVersion.value += 1
  }

  let viewportResizeObserver: ResizeObserver | null = null

  onMounted(() => {
    viewportResizeObserver = new ResizeObserver(updateViewportSize)
    if (viewport.value) viewportResizeObserver.observe(viewport.value)
  })

  onBeforeUnmount(() => {
    viewportResizeObserver?.disconnect()
  })

  return {
    viewport,
    imageInput,
    viewportSize,
    selectedIds,
    editingFrame,
    spacePressed,
    marquee,
    elementDrafts,
    insertionPoint,
    viewportVersion,
    viewportPoint,
    updateViewportSize,
  }
}
