import { ref, computed, watch, type Ref, type ShallowRef } from 'vue'
import { strokeBBox, buildArrowGeometry, type DrawStroke } from '../../../utils/draw/drawEngine'
import type { ResizeHandle } from '../useDrawEditor'

export const HANDLE_HIT = 9
export const ROTATE_OFFSET = 26 // отступ маркера поворота над верхней гранью, экранные px

export type SelectMode = 'move' | 'resize' | 'marquee' | 'rotate' | 'bend'

export interface DrawSelectionChromeOptions {
  canvasWrapEl: Ref<HTMLElement | null>
  overlayEl: ShallowRef<SVGSVGElement | null>
  tool: Ref<string>
  camera: Ref<{ x: number; y: number; scale: number }>
  strokes: Ref<DrawStroke[]>
  selectionBox: Ref<{ minX: number; minY: number; maxX: number; maxY: number } | null>
  selection: Ref<Set<string>>
  bindCandidateId: Ref<string | null>
  isDrawing: Ref<boolean>
  isPanning: Ref<boolean>
  isSelected: (id: string) => boolean
  selectOnly: (id: string) => void
  toggleSelection: (id: string) => void
  clearSelection: () => void
  selectInRect: (rect: { minX: number; minY: number; maxX: number; maxY: number }, additive: boolean) => void
  hitTestStrokeId: (world: { x: number; y: number }) => string | null
  eventToWorld: (event: PointerEvent) => { x: number; y: number }
  beginMoveSelection: (world: { x: number; y: number }) => boolean
  endMoveSelection: () => void
  beginResizeSelection: (handle: ResizeHandle, world: { x: number; y: number }) => boolean
  resizeSelectionTo: (world: { x: number; y: number }, shift: boolean) => void
  endResizeSelection: () => void
  beginRotateSelection: (world: { x: number; y: number }) => boolean
  rotateSelectionTo: (world: { x: number; y: number }) => void
  endRotateSelection: () => void
  beginBendArrow: () => boolean
  bendArrowTo: (world: { x: number; y: number }) => void
  endBendArrow: () => void
  scheduleSave: () => void
}

export function useDrawSelectionChrome(options: DrawSelectionChromeOptions) {
  const selectMode = ref<SelectMode | null>(null)
  const activeHandle = ref<ResizeHandle | null>(null)
  const hoverHandle = ref<ResizeHandle | null>(null)
  const hoverRotate = ref(false)
  const marquee = ref<{ x0: number; y0: number; x1: number; y1: number; additive: boolean } | null>(null)

  function screenPoint(event: PointerEvent) {
    const rect = options.canvasWrapEl.value?.getBoundingClientRect()
    return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : { x: 0, y: 0 }
  }

  const selectionScreen = computed(() => {
    const box = options.selectionBox.value
    if (!box || options.tool.value !== 'select') return null
    const cam = options.camera.value
    const x0 = box.minX * cam.scale + cam.x
    const y0 = box.minY * cam.scale + cam.y
    const x1 = box.maxX * cam.scale + cam.x
    const y1 = box.maxY * cam.scale + cam.y
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2
    const handles: { key: ResizeHandle; x: number; y: number }[] = [
      { key: 'nw', x: x0, y: y0 }, { key: 'n', x: mx, y: y0 }, { key: 'ne', x: x1, y: y0 },
      { key: 'e', x: x1, y: my }, { key: 'se', x: x1, y: y1 }, { key: 's', x: mx, y: y1 },
      { key: 'sw', x: x0, y: y1 }, { key: 'w', x: x0, y: my },
    ]
    const rotate = { x: mx, y: y0 - ROTATE_OFFSET }
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0, handles, rotate, topMid: { x: mx, y: y0 } }
  })

  const bindHighlightScreen = computed(() => {
    const id = options.bindCandidateId.value
    if (!id || !options.isDrawing.value) return null
    const stroke = options.strokes.value.find((s) => s.id === id)
    if (!stroke) return null
    const b = strokeBBox(stroke)
    const cam = options.camera.value
    return {
      left: b.minX * cam.scale + cam.x,
      top: b.minY * cam.scale + cam.y,
      width: (b.maxX - b.minX) * cam.scale,
      height: (b.maxY - b.minY) * cam.scale,
    }
  })

  const marqueeStyle = computed(() => {
    const m = marquee.value
    if (!m) return null
    return {
      left: `${Math.min(m.x0, m.x1)}px`,
      top: `${Math.min(m.y0, m.y1)}px`,
      width: `${Math.abs(m.x1 - m.x0)}px`,
      height: `${Math.abs(m.y1 - m.y0)}px`,
    }
  })

  const selectionAllLocked = computed(() => {
    const ids = options.selection.value
    if (!ids.size) return false
    return options.strokes.value.every((s) => !(s.id && ids.has(s.id)) || s.locked === true)
  })

  const selectionCount = computed(() => options.selection.value.size)

  const bendHandleScreen = computed<{ x: number; y: number } | null>(() => {
    if (options.tool.value !== 'select') return null
    if (options.selection.value.size !== 1) return null
    const id = [...options.selection.value][0]
    const stroke = options.strokes.value.find((s) => s.id === id)
    if (!stroke || stroke.type !== 'arrow' || stroke.arrowShape !== 'bezier') return null
    const pts = stroke.points
    if (!pts || pts.length < 2) return null
    const p0 = pts[0]
    const p1 = pts[pts.length - 1]
    const geom = buildArrowGeometry(p0, p1, 'bezier', stroke.bend)
    if (!geom.apex) return null
    const cam = options.camera.value
    return { x: geom.apex.x * cam.scale + cam.x, y: geom.apex.y * cam.scale + cam.y }
  })

  function hitTestBend(sp: { x: number; y: number }): boolean {
    const h = bendHandleScreen.value
    if (!h) return false
    return Math.abs(sp.x - h.x) <= HANDLE_HIT && Math.abs(sp.y - h.y) <= HANDLE_HIT
  }

  function hitTestHandle(sp: { x: number; y: number }): ResizeHandle | null {
    const sc = selectionScreen.value
    if (!sc) return null
    for (const h of sc.handles) {
      if (Math.abs(sp.x - h.x) <= HANDLE_HIT && Math.abs(sp.y - h.y) <= HANDLE_HIT) return h.key
    }
    return null
  }

  function hitTestRotate(sp: { x: number; y: number }): boolean {
    const sc = selectionScreen.value
    if (!sc) return false
    return Math.abs(sp.x - sc.rotate.x) <= HANDLE_HIT && Math.abs(sp.y - sc.rotate.y) <= HANDLE_HIT
  }

  function handleCursor(h: ResizeHandle): string {
    if (h === 'nw' || h === 'se') return 'nwse'
    if (h === 'ne' || h === 'sw') return 'nesw'
    if (h === 'n' || h === 's') return 'ns'
    return 'ew'
  }

  function onSelectPointerDown(event: PointerEvent) {
    const sp = screenPoint(event)
    if (hitTestRotate(sp) && options.beginRotateSelection(options.eventToWorld(event))) {
      selectMode.value = 'rotate'
      options.overlayEl.value?.setPointerCapture?.(event.pointerId)
      event.preventDefault()
      return
    }
    if (hitTestBend(sp) && options.beginBendArrow()) {
      selectMode.value = 'bend'
      options.overlayEl.value?.setPointerCapture?.(event.pointerId)
      event.preventDefault()
      return
    }
    const handle = hitTestHandle(sp)
    if (handle && options.beginResizeSelection(handle, options.eventToWorld(event))) {
      selectMode.value = 'resize'
      activeHandle.value = handle
      options.overlayEl.value?.setPointerCapture?.(event.pointerId)
      event.preventDefault()
      return
    }
    const id = options.hitTestStrokeId(options.eventToWorld(event))
    if (id) {
      if (event.shiftKey) options.toggleSelection(id)
      else if (!options.isSelected(id)) options.selectOnly(id)
      if (options.isSelected(id)) {
        options.beginMoveSelection(options.eventToWorld(event))
        selectMode.value = 'move'
        options.overlayEl.value?.setPointerCapture?.(event.pointerId)
      }
      event.preventDefault()
      return
    }
    if (!event.shiftKey) options.clearSelection()
    selectMode.value = 'marquee'
    marquee.value = { x0: sp.x, y0: sp.y, x1: sp.x, y1: sp.y, additive: event.shiftKey }
    options.overlayEl.value?.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  function endSelectGesture(event: PointerEvent) {
    const mode = selectMode.value
    options.overlayEl.value?.releasePointerCapture?.(event.pointerId)
    if (mode === 'move') { options.endMoveSelection(); options.scheduleSave() }
    else if (mode === 'resize') { options.endResizeSelection(); options.scheduleSave() }
    else if (mode === 'rotate') { options.endRotateSelection(); options.scheduleSave() }
    else if (mode === 'bend') { options.endBendArrow(); options.scheduleSave() }
    else if (mode === 'marquee' && marquee.value) {
      const m = marquee.value
      const cam = options.camera.value
      const toW = (sx: number, sy: number) => ({ x: (sx - cam.x) / cam.scale, y: (sy - cam.y) / cam.scale })
      const a = toW(Math.min(m.x0, m.x1), Math.min(m.y0, m.y1))
      const b = toW(Math.max(m.x0, m.x1), Math.max(m.y0, m.y1))
      options.selectInRect({ minX: a.x, minY: a.y, maxX: b.x, maxY: b.y }, m.additive)
    }
    selectMode.value = null
    activeHandle.value = null
    marquee.value = null
  }

  function onPointerMoveChrome(event: PointerEvent) {
    if (selectMode.value === 'bend') { options.bendArrowTo(options.eventToWorld(event)); return }
    if (selectMode.value === 'resize') { options.resizeSelectionTo(options.eventToWorld(event), event.shiftKey); return }
    if (selectMode.value === 'rotate') { options.rotateSelectionTo(options.eventToWorld(event)); return }
    if (selectMode.value === 'marquee' && marquee.value) {
      const sp = screenPoint(event)
      marquee.value = { ...marquee.value, x1: sp.x, y1: sp.y }
      return
    }
    if (options.tool.value === 'select' && !options.isPanning.value) {
      const sp = screenPoint(event)
      hoverRotate.value = hitTestRotate(sp)
      hoverHandle.value = hoverRotate.value ? null : hitTestHandle(sp)
    }
  }

  const cursorClass = computed(() => {
    if (options.isPanning.value) return null
    if (options.tool.value !== 'select') return null
    if (selectMode.value === 'move') return 'is-panning'
    if (selectMode.value === 'rotate' || hoverRotate.value) return 'is-rotate'
    const h = activeHandle.value ?? hoverHandle.value
    if (h) return `is-resize-${handleCursor(h)}`
    return 'is-select'
  })

  watch(() => options.tool.value, (t, prev) => {
    if (prev === 'select' && t !== 'select') options.clearSelection()
  })

  return {
    selectMode,
    activeHandle,
    hoverHandle,
    hoverRotate,
    marquee,
    selectionScreen,
    bindHighlightScreen,
    bendHandleScreen,
    marqueeStyle,
    selectionAllLocked,
    selectionCount,
    hitTestHandle,
    hitTestRotate,
    handleCursor,
    screenPoint,
    onSelectPointerDown,
    endSelectGesture,
    onPointerMoveChrome,
    cursorClass,
    HANDLE_HIT,
    ROTATE_OFFSET,
  }
}
