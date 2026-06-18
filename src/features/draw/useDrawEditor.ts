import { ref, shallowRef, computed } from 'vue'
import {
  DEFAULT_STROKE_COLOR,
  DEFAULT_STROKE_SIZE,
  DEFAULT_ROUGHNESS,
  parseDrawData,
  serializeDrawData,
  renderDrawToSvgString,
  type DrawData,
  type DrawPoint,
  type DrawStroke,
  type DrawTool,
} from '../../utils/draw/drawEngine'

/** Editor tool selection (includes the eraser, which doesn't produce a stroke). */
export type DrawEditorTool = DrawTool | 'eraser'

export interface DrawSavePayload {
  drawId: string
  svgPreview: string
  src: string
}

export interface UseDrawEditorOptions {
  drawId: string
  /** Persist the serialized payload; returns the relative asset `src`. */
  onSave: (bytes: number[]) => Promise<string>
  /** Notify the parent that preview/src changed (updates the note node). */
  onPersisted: (payload: DrawSavePayload) => void
  /** Called when a save fails so the UI can surface it (not swallow it). */
  onSaveError?: (error: unknown) => void
  /** Initial raw bytes (from read_draw_asset). Empty for a new drawing. */
  initialBytes?: number[] | null
}

export type DrawColor = string

const PALETTE: DrawColor[] = ['#1e1e1e', '#e03131', '#2f9e44', '#1971c2', '#f08c00', '#9c36b5', '#868e96']

/**
 * Vue composable that owns the drawing state and exposes a small imperative
 * API consumed by DrawView.vue: tool selection, pointer handlers (start/move/
 * end), undo/redo, clear, save. Rendering goes through drawEngine (roughjs +
 * perfect-freehand, lazily imported), so the composable itself stays light.
 */
export function useDrawEditor(options: UseDrawEditorOptions) {
  const strokes = ref<DrawStroke[]>([])
  const bgColor = ref<string>('transparent')
  const tool = ref<DrawEditorTool>('freehand')
  const color = ref<DrawColor>(DEFAULT_STROKE_COLOR)
  const size = ref<number>(DEFAULT_STROKE_SIZE)

  // History stacks for undo/redo. Each entry is a full snapshot (small for
  // typical drawings; could be delta-based later if needed).
  const undoStack = ref<DrawStroke[][]>([])
  const redoStack = ref<DrawStroke[][]>([])

  // Current in-progress stroke (not yet committed).
  const activeStroke = shallowRef<DrawStroke | null>(null)
  const isDrawing = ref(false)

  // SVG overlay element where live preview is painted during a stroke.
  const overlayEl = shallowRef<SVGSVGElement | null>(null)

  const isEmpty = computed(() => strokes.value.length === 0)

  function pushHistory() {
    undoStack.value.push(strokes.value.map((s) => ({ ...s, points: [...s.points] })))
    if (undoStack.value.length > 100) undoStack.value.shift()
    redoStack.value = []
  }

  function loadFromBytes(bytes: number[] | null | undefined) {
    const json = bytes && bytes.length ? new TextDecoder().decode(new Uint8Array(bytes)) : ''
    const data = parseDrawData(json)
    strokes.value = data.strokes
    bgColor.value = data.bgColor
    undoStack.value = []
    redoStack.value = []
  }

  // Initial load.
  loadFromBytes(options.initialBytes)

  function pointFromEvent(event: PointerEvent, svg: SVGSVGElement): DrawPoint {
    const p = typeof event.pressure === 'number' && event.pressure > 0 ? event.pressure : 0.5
    // Strokes are stored in the SVG's viewBox user-space, but the canvas is
    // scaled/letterboxed onto the screen via viewBox + preserveAspectRatio.
    // Map the client coordinates through the screen CTM so the captured point
    // lands exactly under the cursor (a plain rect-relative offset ignores the
    // viewBox scale and shifts strokes up-left).
    const ctm = svg.getScreenCTM?.()
    if (ctm && typeof svg.createSVGPoint === 'function') {
      const pt = svg.createSVGPoint()
      pt.x = event.clientX
      pt.y = event.clientY
      const sp = pt.matrixTransform(ctm.inverse())
      return { x: sp.x, y: sp.y, p }
    }
    // Fallback for environments without an SVG CTM (e.g. jsdom in tests).
    const rect = svg.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top, p }
  }

  function beginStroke(event: PointerEvent) {
    if (!overlayEl.value) return
    event.preventDefault()
    const point = pointFromEvent(event, overlayEl.value)

    if (tool.value === 'eraser') {
      eraseAt(point)
      return
    }

    isDrawing.value = true
    const strokeType: DrawTool = tool.value
    activeStroke.value = {
      type: strokeType,
      points: [point, point],
      color: color.value,
      size: size.value,
      roughness: DEFAULT_ROUGHNESS,
    }
    // Disable text selection / scrolling while drawing.
    overlayEl.value.setPointerCapture?.(event.pointerId)
  }

  function moveStroke(event: PointerEvent) {
    if (!overlayEl.value) return
    if (tool.value === 'eraser') {
      if (event.buttons === 1) eraseAt(pointFromEvent(event, overlayEl.value))
      return
    }
    if (!isDrawing.value || !activeStroke.value) return
    event.preventDefault()
    const point = pointFromEvent(event, overlayEl.value)

    if (activeStroke.value.type === 'freehand') {
      // Accumulate every sample for pressure-sensitive smoothing.
      activeStroke.value.points.push(point)
    } else {
      // Geometry: keep only the anchor + the current endpoint.
      const pts = activeStroke.value.points
      pts[1] = point
    }
    // Trigger reactivity for the live preview overlay.
    activeStroke.value = { ...activeStroke.value, points: [...activeStroke.value.points] }
  }

  function endStroke(event: PointerEvent) {
    if (!isDrawing.value || !activeStroke.value) {
      isDrawing.value = false
      activeStroke.value = null
      return
    }
    event?.preventDefault()
    overlayEl.value?.releasePointerCapture?.(event.pointerId)

    // Drop degenerate strokes (click without drag on geometry).
    const pts = activeStroke.value.points
    if (activeStroke.value.type !== 'freehand' && pts.length >= 2) {
      const [a, b] = pts
      if (Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2) {
        isDrawing.value = false
        activeStroke.value = null
        return
      }
    }

    pushHistory()
    strokes.value = [...strokes.value, activeStroke.value]
    isDrawing.value = false
    activeStroke.value = null
  }

  /** Erase the topmost stroke under the cursor (hit-test by bounding box). */
  function eraseAt(point: DrawPoint) {
    for (let i = strokes.value.length - 1; i >= 0; i--) {
      const s = strokes.value[i]
      const xs = s.points.map((p) => p.x)
      const ys = s.points.map((p) => p.y)
      const minX = Math.min(...xs) - s.size
      const maxX = Math.max(...xs) + s.size
      const minY = Math.min(...ys) - s.size
      const maxY = Math.max(...ys) + s.size
      if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
        pushHistory()
        strokes.value = strokes.value.filter((_, idx) => idx !== i)
        return
      }
    }
  }

  function undo() {
    if (undoStack.value.length === 0) return
    redoStack.value.push(strokes.value.map((s) => ({ ...s, points: [...s.points] })))
    strokes.value = undoStack.value.pop()!
  }

  function redo() {
    if (redoStack.value.length === 0) return
    undoStack.value.push(strokes.value.map((s) => ({ ...s, points: [...s.points] })))
    strokes.value = redoStack.value.pop()!
  }

  function clear() {
    if (strokes.value.length === 0) return
    pushHistory()
    strokes.value = []
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  // Whether there are edits not yet written to disk. Tracked explicitly so
  // flushSave() can guarantee a write even when no debounce timer is pending
  // (e.g. the drawing settled before the user navigated back).
  let dirtySinceSave = false
  // Serialise saves through a promise chain so a flush triggered by navigation
  // never races a concurrent debounced save of the same drawing.
  let saveChain: Promise<void> = Promise.resolve()

  async function doSave() {
    if (!dirtySinceSave) return
    dirtySinceSave = false
    const data: DrawData = { version: 1, strokes: strokes.value, bgColor: bgColor.value }
    const json = serializeDrawData(data)
    const bytes = Array.from(new TextEncoder().encode(json))
    try {
      const src = await options.onSave(bytes)
      const svgPreview = await renderDrawToSvgString(data)
      options.onPersisted({ drawId: options.drawId, svgPreview, src })
    } catch (error) {
      // Keep the edits dirty so a later flush retries the write, and surface
      // the failure instead of letting it vanish into an unhandled rejection.
      dirtySinceSave = true
      options.onSaveError?.(error)
      throw error
    }
  }

  /** Persist the current drawing. Calls are serialised to avoid write races. */
  function save(): Promise<void> {
    saveChain = saveChain.then(doSave, doSave)
    return saveChain
  }

  /** Debounced save — coalesces rapid edits into one write. */
  function scheduleSave(delay = 600) {
    dirtySinceSave = true
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => { saveTimer = null; void save() }, delay)
  }

  /**
   * Flush any pending edits to disk and resolve once the write completes.
   * Callers (e.g. the back button) must await this before navigating away so
   * the persisted note picks up the new asset src before the editor remounts.
   */
  function flushSave(): Promise<void> {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    // Swallow here so navigation (back button) is never blocked by a failed
    // write — the failure is already surfaced through options.onSaveError.
    return save().catch(() => {})
  }

  function setOverlay(el: SVGSVGElement | null) {
    overlayEl.value = el
  }

  return {
    // state
    strokes,
    activeStroke,
    bgColor,
    tool,
    color,
    size,
    isDrawing,
    isEmpty,
    palette: PALETTE,
    canUndo: computed(() => undoStack.value.length > 0),
    canRedo: computed(() => redoStack.value.length > 0),
    // actions
    setOverlay,
    beginStroke,
    moveStroke,
    endStroke,
    undo,
    redo,
    clear,
    save,
    scheduleSave,
    flushSave,
  }
}
