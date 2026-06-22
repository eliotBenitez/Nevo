import { ref, computed, type Ref, type ShallowRef } from 'vue'
import type { SelectMode } from './useDrawSelectionChrome'

export interface DrawPointerOptions {
  overlayEl: ShallowRef<SVGSVGElement | null>
  canvasWrapEl: Ref<HTMLElement | null>
  tool: Ref<string>
  size: Ref<number>
  camera: Ref<{ x: number; y: number; scale: number }>
  isMovingStroke: Ref<boolean>
  isPanning: Ref<boolean>
  selectMode: Ref<SelectMode | null>
  onSelectPointerDown: (event: PointerEvent) => void
  endSelectGesture: (event: PointerEvent) => void
  onPointerMoveChrome: (event: PointerEvent) => void
  tryBeginMove: (event: PointerEvent) => boolean
  beginStroke: (event: PointerEvent) => void
  moveStroke: (event: PointerEvent) => void
  endStroke: (event: PointerEvent) => void
  moveStrokeAt: (event: PointerEvent) => void
  endMove: (event: PointerEvent) => void
  panBy: (dx: number, dy: number) => void
  onWheelEditor: (event: WheelEvent) => void
  scheduleSave: () => void
  eventToWorld: (event: PointerEvent) => { x: number; y: number }
  hitTestStrokeId: (world: { x: number; y: number }) => string | null
  beginEditText: (id: string) => void
  strokes: Ref<Array<{ id?: string; type: string }>>
  moveSelectionTo: (world: { x: number; y: number }) => void
}

export function useDrawPointer(options: DrawPointerOptions) {
  let panLastX = 0
  let panLastY = 0
  const isPanning = options.isPanning

  const eraserCursor = ref({ x: 0, y: 0, visible: false })
  const eraserCursorSize = computed(() =>
    Math.max(8, options.size.value * (options.camera.value.scale || 1)),
  )

  function updateEraserCursor(event: PointerEvent) {
    const rect = options.canvasWrapEl.value?.getBoundingClientRect()
    if (!rect) return
    eraserCursor.value = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      visible: true,
    }
  }

  function startPan(event: PointerEvent) {
    isPanning.value = true
    panLastX = event.clientX
    panLastY = event.clientY
    options.overlayEl.value?.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button === 1) {
      startPan(event)
      return
    }
    if (options.tool.value === 'hand' && event.button === 0) {
      if (options.tryBeginMove(event)) return
      startPan(event)
      return
    }
    if (options.tool.value === 'select' && event.button === 0) {
      options.onSelectPointerDown(event)
      return
    }
    options.beginStroke(event)
  }

  function onPointerMove(event: PointerEvent) {
    if (options.tool.value === 'eraser') updateEraserCursor(event)
    if (options.selectMode.value === 'move') { options.moveSelectionTo(options.eventToWorld(event)); return }
    if (options.selectMode.value === 'resize' || options.selectMode.value === 'rotate' || options.selectMode.value === 'marquee') {
      options.onPointerMoveChrome(event)
      return
    }
    options.onPointerMoveChrome(event)
    if (options.isMovingStroke.value) {
      options.moveStrokeAt(event)
      return
    }
    if (isPanning.value) {
      const dx = event.clientX - panLastX
      const dy = event.clientY - panLastY
      panLastX = event.clientX
      panLastY = event.clientY
      options.panBy(dx, dy)
      event.preventDefault()
      return
    }
    options.moveStroke(event)
  }

  function onPointerUp(event: PointerEvent) {
    if (options.selectMode.value) {
      options.endSelectGesture(event)
      return
    }
    if (options.isMovingStroke.value) {
      options.endMove(event)
      return
    }
    if (isPanning.value) {
      isPanning.value = false
      options.overlayEl.value?.releasePointerCapture?.(event.pointerId)
      options.scheduleSave()
      return
    }
    options.endStroke(event)
  }

  function onPointerLeave(event: PointerEvent) {
    eraserCursor.value.visible = false
    onPointerUp(event)
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    options.onWheelEditor(event)
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button === 1) { event.preventDefault(); return }
    if (options.tool.value === 'text' && event.button === 0) event.preventDefault()
  }

  function onCanvasDblClick(event: MouseEvent) {
    if (options.tool.value !== 'select') return
    const world = options.eventToWorld(event as unknown as PointerEvent)
    const id = options.hitTestStrokeId(world)
    if (!id) return
    const stroke = options.strokes.value.find((s) => s.id === id)
    if (stroke && stroke.type === 'text') options.beginEditText(id)
  }

  return {
    isPanning,
    eraserCursor,
    eraserCursorSize,
    updateEraserCursor,
    startPan,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    onWheel,
    onMouseDown,
    onCanvasDblClick,
  }
}
