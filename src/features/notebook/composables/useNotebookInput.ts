import { computed, ref, shallowRef } from 'vue'
import type { ComputedRef, ShallowRef } from 'vue'
import type { NotebookPointV1 } from '../../../core/notebook/types'
import type { NotebookLineStyle } from '../../../core/notebook/types'
import { createNotebookId } from '../../../core/notebook/codec'
import { snapNotebookAngle } from '../../../core/notebook/line'
import { isNotebookShapeKind, snapNotebookShapePoint } from '../../../core/notebook/shape'
import type { NotebookShapeKind } from '../../../core/notebook/shape'
import { projectNotebookRulerPoint } from '../../../core/notebook/ruler'
import type { NotebookRulerGuide } from '../../../core/notebook/ruler'
import { createStrokeModeler } from '../../../core/notebook/strokeModeler'
import type { ModeledPoint, StrokeModeler } from '../../../core/notebook/strokeModeler'

export type NotebookInputTool = 'pen' | 'marker' | 'eraser' | 'lasso' | 'laser' | 'arrow' | 'line' | 'move' | 'hand' | NotebookShapeKind

export type NotebookEraserMode = 'partial' | 'stroke'

export interface NotebookGestureStyle {
  color: string
  width: number
  markerWidth: number
  eraserDiameter: number
  dash?: NotebookLineStyle
  eraserMode?: NotebookEraserMode
  /** Set on gestures whose points are stroke-modeler output; stored as `path: 'modeled'`. */
  modeled?: boolean
}

interface ModelerSample {
  x: number
  y: number
  time: number
  pressure: number
}

interface ActivePointer {
  id: number
  pointerType: string
  tool: NotebookInputTool
  style: NotebookGestureStyle
  element: PointerCaptureElement
  origin: { left: number; top: number }
  zoom: number
  points: NotebookPointV1[]
  /** Accepted raw samples of a modeled gesture; hold recognition reads these, not the modeled trajectory. */
  raw: NotebookPointV1[]
  modeler: StrokeModeler | null
  startStamp: number
  lastSample: ModelerSample | null
  lastKey: string
  lastTimeStamp: number
  actionId: string
  pageId: string | null
  rulerGuide: NotebookRulerGuide | null
  recognized: boolean
  holdAnchor: NotebookPointV1
  holdStarted: boolean
}

export interface NotebookInput {
  activePoints: ShallowRef<NotebookPointV1[]>
  /** True while the live preview shows a stroke-modeled gesture. */
  isModeled: ComputedRef<boolean>
  isActive: ComputedRef<boolean>
  isPenActive: ComputedRef<boolean>
  isTouchNavigationSuppressed: ComputedRef<boolean>
  pointerDown(event: PointerEvent): void
  pointerMove(event: PointerEvent): void
  pointerUp(event: PointerEvent): void
  pointerCancel(event: PointerEvent): void
  lostPointerCapture(event: PointerEvent): void
  finish(): void
  cancel(): void
  pause(): void
  resume(): void
}

/** Fewest pointer samples a held gesture needs before it may snap to a shape. */
const HOLD_RECOGNITION_MIN_SAMPLES = 4
const HOLD_TOLERANCE_PX = 4

type PointerCaptureElement =Element & Pick<HTMLElement, 'setPointerCapture' | 'releasePointerCapture'>

function pressureOf(event: PointerEvent): number {
  if (event.pointerType === 'mouse') return 0.5
  return Number.isFinite(event.pressure) ? Math.min(1, Math.max(0, event.pressure)) : 0.5
}

export function createNotebookInput(options: {
  element: () => PointerCaptureElement | null
  zoom: () => number
  tool: () => NotebookInputTool
  style?: () => NotebookGestureStyle
  /** Model pen and marker strokes (off by default). */
  modelStrokes?: () => boolean
  pageId?: () => string | null
  rulerGuide?: (point: NotebookPointV1) => NotebookRulerGuide | null
  onStroke: (points: NotebookPointV1[], tool: NotebookInputTool, style: NotebookGestureStyle, actionId: string, pageId: string | null) => void
  onCheckpoint?: (points: NotebookPointV1[], tool: NotebookInputTool, style: NotebookGestureStyle, actionId: string, pageId: string | null) => void
  recognizeHold?: (points: NotebookPointV1[]) => NotebookPointV1[] | null
  onRecognized?: (points: NotebookPointV1[], style: NotebookGestureStyle, actionId: string, pageId: string | null) => void
  holdDelayMs?: number
  onSuppressedTouch?: (suppressed: boolean) => void
  touchPointerIds?: () => readonly number[]
}): NotebookInput {
  const activePoints = shallowRef<NotebookPointV1[]>([])
  const activePointer = shallowRef<ActivePointer | null>(null)
  const activeTouchIds = new Set<number>()
  const suppressedTouchIds = new Set<number>()
  const suppressedTouchRevision = ref(0)
  const isPenActive = computed(() => activePointer.value?.pointerType === 'pen')
  const isActive = computed(() => activePointer.value !== null)
  const isModeled = computed(() => activePointer.value?.modeler != null)
  const isTouchNavigationSuppressed = computed(() => {
    void suppressedTouchRevision.value
    return activePointer.value !== null || suppressedTouchIds.size > 0
  })
  let lastSuppressed = false
  let previewFrame = 0
  let checkpointTimer: number | undefined
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  let paused = false

  function reportTouchSuppression(): void {
    const suppressed = isTouchNavigationSuppressed.value
    if (suppressed === lastSuppressed) return
    lastSuppressed = suppressed
    options.onSuppressedTouch?.(suppressed)
  }

  function pointFromEvent(
    event: PointerEvent,
    origin: { left: number; top: number },
    zoom: number,
  ): NotebookPointV1 {
    return {
      x: (event.clientX - origin.left) / zoom,
      y: (event.clientY - origin.top) / zoom,
      pressure: pressureOf(event),
    }
  }

  function toPoint(point: ModeledPoint): NotebookPointV1 {
    return { x: point.x, y: point.y, pressure: point.pressure }
  }

  /** Append-only so checkpoints stay prefixes of the final stroke; zero-length steps are skipped. */
  function pushModeled(gesture: ActivePointer, modeled: ModeledPoint[]): void {
    for (const point of modeled) {
      const last = gesture.points[gesture.points.length - 1]
      if (last && last.x === point.x && last.y === point.y) continue
      gesture.points.push(toPoint(point))
    }
  }

  function previewPoints(gesture: ActivePointer): NotebookPointV1[] {
    // The prediction is display-only and never stored.
    return gesture.modeler ? [...gesture.points, ...gesture.modeler.predict().map(toPoint)] : [...gesture.points]
  }

  function outgoingStyle(gesture: ActivePointer): NotebookGestureStyle {
    return gesture.modeler ? { ...gesture.style, modeled: true } : gesture.style
  }

  function clearTimers(): void {
    if (checkpointTimer !== undefined) clearInterval(checkpointTimer)
    checkpointTimer = undefined
    if (holdTimer !== undefined) clearTimeout(holdTimer)
    holdTimer = undefined
  }

  function holdEnabled(gesture: ActivePointer): boolean {
    return gesture.tool === 'pen' && !gesture.rulerGuide && !!options.recognizeHold && !!options.onRecognized
  }

  function recognizeHeld(gesture: ActivePointer): void {
    holdTimer = undefined
    if (activePointer.value !== gesture || gesture.recognized) return
    const samples = gesture.modeler ? gesture.raw : gesture.points
    // A real drawn shape has many samples. Snapping a pen that merely rests after a
    // single jump would freeze the gesture and swallow the writing that follows.
    if (samples.length < HOLD_RECOGNITION_MIN_SAMPLES) return
    const recognized = options.recognizeHold?.([...samples])
    if (!recognized) return
    gesture.modeler?.reset()
    gesture.modeler = null
    gesture.points = recognized
    gesture.recognized = true
    if (checkpointTimer !== undefined) clearInterval(checkpointTimer)
    checkpointTimer = undefined
    // Commit now rather than on release: checkpoints may already have saved the
    // freehand ink, and only the document swap removes it from the page.
    activePoints.value = []
    options.onRecognized?.(recognized, gesture.style, gesture.actionId, gesture.pageId)
  }

  function trackHold(gesture: ActivePointer, point: NotebookPointV1): void {
    if (!holdEnabled(gesture)) return
    const moved = Math.hypot(point.x - gesture.holdAnchor.x, point.y - gesture.holdAnchor.y) * gesture.zoom > HOLD_TOLERANCE_PX
    if (gesture.holdStarted && !moved) return
    if (moved) gesture.holdAnchor = point
    gesture.holdStarted = true
    if (holdTimer !== undefined) clearTimeout(holdTimer)
    holdTimer = setTimeout(() => recognizeHeld(gesture), options.holdDelayMs ?? 500)
  }

  function append(event: PointerEvent): void {
    const gesture = activePointer.value
    if (!gesture || event.pointerId !== gesture.id || gesture.recognized) return
    const key = `${event.timeStamp}:${event.clientX}:${event.clientY}:${pressureOf(event)}`
    if (key === gesture.lastKey || event.timeStamp < gesture.lastTimeStamp) return
    let point = pointFromEvent(event, gesture.origin, gesture.zoom)
    if (gesture.rulerGuide) point = projectNotebookRulerPoint(point, gesture.rulerGuide)
    const anchor = gesture.points[0]
    if (gesture.tool === 'line' && event.shiftKey && anchor) point = snapNotebookAngle(anchor, point)
    else if (anchor && isNotebookShapeKind(gesture.tool) && (event.shiftKey || gesture.tool === 'circle')) {
      point = snapNotebookShapePoint(anchor, point)
    }
    gesture.lastKey = key
    gesture.lastTimeStamp = event.timeStamp
    if (gesture.modeler) {
      gesture.raw.push(point)
      // Events can share a millisecond timestamp (coarse clocks, fast tablets); the modeler
      // emits nothing for a zero time step, so keep its clock strictly increasing.
      const sample = {
        x: point.x,
        y: point.y,
        time: Math.max((event.timeStamp - gesture.startStamp) / 1000, (gesture.lastSample?.time ?? 0) + 0.001),
        pressure: point.pressure ?? 0.5,
      }
      gesture.lastSample = sample
      pushModeled(gesture, gesture.modeler.update({ kind: 'move', ...sample }))
    } else {
      gesture.points.push(point)
    }
    trackHold(gesture, point)
    if (!previewFrame) {
      const schedule = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 16) as unknown as number
      previewFrame = schedule(() => {
        previewFrame = 0
        if (activePointer.value === gesture) activePoints.value = previewPoints(gesture)
      })
    }
  }

  function finishAccepted(): void {
    const gesture = activePointer.value
    if (!gesture) return
    activePointer.value = null
    if (previewFrame) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(previewFrame)
      else clearTimeout(previewFrame)
      previewFrame = 0
    }
    activePoints.value = []
    clearTimers()
    try {
      gesture.element.releasePointerCapture(gesture.id)
    } catch {
      // Browsers throw when capture was already released by cancellation.
    }
    if (!gesture.recognized) {
      // The 'up' event lets the pen tip catch up with the lift point before the stroke is committed.
      if (gesture.modeler && gesture.lastSample) pushModeled(gesture, gesture.modeler.update({ kind: 'up', ...gesture.lastSample }))
      options.onStroke(gesture.points, gesture.tool, outgoingStyle(gesture), gesture.actionId, gesture.pageId)
    }
    reportTouchSuppression()
  }

  function finish(): void {
    const gesture = activePointer.value
    if (!gesture) return
    if (gesture.tool === 'lasso' || gesture.tool === 'move') cancel()
    else finishAccepted()
  }

  function cancel(): void {
    const gesture = activePointer.value
    if (!gesture) return
    activePointer.value = null
    gesture.modeler?.reset()
    if (previewFrame) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(previewFrame)
      else clearTimeout(previewFrame)
      previewFrame = 0
    }
    activePoints.value = []
    clearTimers()
    try {
      gesture.element.releasePointerCapture(gesture.id)
    } catch {
      // Capture can already be gone after a platform cancellation.
    }
    reportTouchSuppression()
  }

  function pointerDown(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      activeTouchIds.add(event.pointerId)
      if (activePointer.value && !suppressedTouchIds.has(event.pointerId)) {
        suppressedTouchIds.add(event.pointerId)
        suppressedTouchRevision.value += 1
      }
      reportTouchSuppression()
      return
    }
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (activePointer.value) return
    if (paused) return
    const eventElement = event.currentTarget as PointerCaptureElement | null
    const element = eventElement?.getBoundingClientRect ? eventElement : options.element()
    if (!element) return
    event.preventDefault()
    const bounds = element.getBoundingClientRect()
    const origin = { left: bounds.left, top: bounds.top }
    const zoom = Math.max(options.zoom(), 0.01)
    const point = pointFromEvent(event, origin, zoom)
    const tool = options.tool()
    const rulerGuide = tool === 'pen' || tool === 'marker' ? options.rulerGuide?.(point) ?? null : null
    const key = `${event.timeStamp}:${event.clientX}:${event.clientY}:${pressureOf(event)}`
    const modeled = (tool === 'pen' || tool === 'marker') && !rulerGuide && options.modelStrokes?.() === true
      && Number.isFinite(event.timeStamp)
    const firstPoint = rulerGuide ? projectNotebookRulerPoint(point, rulerGuide) : point
    const gesture: ActivePointer = {
      id: event.pointerId,
      pointerType: event.pointerType,
      tool,
      style: options.style?.() ?? { color: '#000000', width: 1.5, markerWidth: 12, eraserDiameter: 12 },
      element,
      origin,
      zoom,
      points: [firstPoint],
      raw: [firstPoint],
      modeler: modeled ? createStrokeModeler() : null,
      startStamp: event.timeStamp,
      lastSample: null,
      lastKey: key,
      lastTimeStamp: event.timeStamp,
      actionId: createNotebookId(),
      pageId: options.pageId?.() ?? null,
      rulerGuide,
      recognized: false,
      holdAnchor: point,
      holdStarted: false,
    }
    activePointer.value = gesture
    if (gesture.modeler) {
      gesture.lastSample = { x: firstPoint.x, y: firstPoint.y, time: 0, pressure: firstPoint.pressure ?? 0.5 }
      gesture.modeler.update({ kind: 'down', ...gesture.lastSample })
    }
    if (event.pointerType === 'pen') {
      for (const pointerId of [...activeTouchIds, ...(options.touchPointerIds?.() ?? [])]) suppressedTouchIds.add(pointerId)
      suppressedTouchRevision.value += 1
    }
    activePoints.value = [...gesture.points]
    if (options.onCheckpoint && gesture.tool !== 'laser' && gesture.tool !== 'arrow' && gesture.tool !== 'line' && !isNotebookShapeKind(gesture.tool)) {
      checkpointTimer = setInterval(() => {
        const current = activePointer.value
        if (current && current.points.length) options.onCheckpoint?.([...current.points], current.tool, outgoingStyle(current), current.actionId, current.pageId)
      }, 2_000) as unknown as number
    }
    try {
      element.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture may be unavailable in embedded webviews; document-level
      // up/cancel handlers still finalize the accepted points.
    }
    reportTouchSuppression()
  }

  function pointerMove(event: PointerEvent): void {
    const gesture = activePointer.value
    if (!gesture || event.pointerId !== gesture.id) return
    event.preventDefault()
    let samples: PointerEvent[] = [event]
    try {
      const coalesced = event.getCoalescedEvents?.()
      if (coalesced?.length) samples = coalesced
    } catch {
      samples = [event]
    }
    for (const sample of samples) append(sample)
    if (samples[samples.length - 1] !== event) append(event)
  }

  function pointerUp(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      activeTouchIds.delete(event.pointerId)
      if (suppressedTouchIds.delete(event.pointerId)) suppressedTouchRevision.value += 1
      reportTouchSuppression()
      return
    }
    append(event)
    if (activePointer.value?.id === event.pointerId) finishAccepted()
  }

  function pointerCancel(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      activeTouchIds.delete(event.pointerId)
      if (suppressedTouchIds.delete(event.pointerId)) suppressedTouchRevision.value += 1
      reportTouchSuppression()
      return
    }
    const gesture = activePointer.value
    if (gesture?.id !== event.pointerId) return
    if (gesture.tool === 'lasso' || gesture.tool === 'move') cancel()
    else finishAccepted()
  }

  function lostPointerCapture(event: PointerEvent): void {
    const gesture = activePointer.value
    if (gesture?.id !== event.pointerId) return
    if (gesture.tool === 'lasso' || gesture.tool === 'move') cancel()
    else finishAccepted()
  }

  return {
    activePoints,
    isModeled,
    isActive,
    isPenActive,
    isTouchNavigationSuppressed,
    pointerDown,
    pointerMove,
    pointerUp,
    pointerCancel,
    lostPointerCapture,
    finish,
    cancel,
    pause: () => { paused = true },
    resume: () => { paused = false },
  }
}
