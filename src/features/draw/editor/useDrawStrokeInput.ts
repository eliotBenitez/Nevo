import { shallowRef, ref, computed } from 'vue'
import type { Ref, ComputedRef, ShallowRef } from 'vue'
import {
  generateStrokeId,
  reflowBoundArrows,
  isFreehandType,
  computeBounds,
  type DrawStroke,
  type DrawCamera,
  type DrawCanvasSize,
} from '../../../utils/draw/drawEngine'
import {
  pointFromEvent,
  hitTestStrokeIndex,
  hitTestBindableId,
  CLOSED_SHAPE_TYPES,
  GEOMETRY_TYPES,
  constrainGeometryPoint,
  recognizeShape,
} from './drawGeometry'
import type { DrawPoint } from './drawGeometry'
import type { DrawHistory } from './useDrawHistory'
import type { DrawEditorTool } from '../useDrawEditor'
import type { DrawFillStyle, DrawStrokeStyle, DrawArrowShape, DrawArrowCap } from '../../../utils/draw/drawEngine'

interface StyleForStroke {
  color: Ref<string>
  size: Ref<number>
  fillColor: Ref<string>
  fillStyle: Ref<DrawFillStyle>
  strokeStyle: Ref<DrawStrokeStyle>
  opacity: Ref<number>
  roughness: Ref<number>
  arrowShape: Ref<DrawArrowShape>
  startCap: Ref<DrawArrowCap>
  endCap: Ref<DrawArrowCap>
}

interface SelectionForStroke {
  selectOnly(id: string): void
}

interface CameraForStroke {
  camera: Ref<DrawCamera>
  viewportSize(): { w: number; h: number }
}

export interface DrawStrokeInput {
  activeStroke: ShallowRef<DrawStroke | null>
  isDrawing: Ref<boolean>
  bindCandidateId: Ref<string | null>
  isMovingStroke: ComputedRef<boolean>
  beginStroke(event: PointerEvent): void
  moveStroke(event: PointerEvent): void
  endStroke(event: PointerEvent): void
  eraseAt(point: DrawPoint): void
  tryBeginMove(event: PointerEvent): boolean
  moveStrokeAt(event: PointerEvent): void
  endMove(event: PointerEvent): void
  insertImageStroke(input: InsertImageInput): string | null
  insertTemplate(template: DrawStroke[]): string | null
  eventToWorld(event: PointerEvent): DrawPoint
}

interface InsertImageInput {
  assetSrc: string
  naturalWidth: number
  naturalHeight: number
  /** Центр в world-координатах; по умолчанию — центр вьюпорта. */
  center?: { x: number; y: number }
}

export function createDrawStrokeInput(ctx: {
  strokes: Ref<DrawStroke[]>
  tool: Ref<DrawEditorTool>
  style: StyleForStroke
  overlayEl: Ref<SVGSVGElement | null>
  bindCandidateId: Ref<string | null>
  history: DrawHistory
  camera: CameraForStroke
  selection: SelectionForStroke
  scheduleSave: () => void
  beginText: (point: DrawPoint) => void
  canvasSize: Ref<DrawCanvasSize>
  autoDetectShapes: Ref<boolean>
}): DrawStrokeInput {
  const {
    strokes, tool, style, overlayEl, bindCandidateId,
    history, camera, selection, scheduleSave, beginText,
    autoDetectShapes,
  } = ctx

  const activeStroke = shallowRef<DrawStroke | null>(null)
  const isDrawing = ref(false)

  // --- Перемещение объектов (инструмент «рука») -----------------------------
  // Перетаскиваемый штрих временно вынимается из committed-слоя и рисуется на
  // overlay (как активный штрих), чтобы не перерисовывать весь холст каждый
  // кадр. На отпускании возвращается на исходную позицию в массиве (z-order
  // сохраняется). История пишется только если объект реально сдвинули.
  const movingStroke = shallowRef<{
    index: number
    last: DrawPoint
    snapshot: DrawStroke[]
    moved: boolean
  } | null>(null)

  const isMovingStroke = computed(() => movingStroke.value !== null)

  /** Если под точкой есть незаблокированный объект — начать его перетаскивание. true, если начали. */
  function beginMoveStroke(point: DrawPoint): boolean {
    const index = hitTestStrokeIndex(strokes.value, point, false)
    if (index < 0) return false
    const target = strokes.value[index]
    if (!target) return false
    const snapshot = strokes.value.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
    activeStroke.value = { ...target, points: target.points.map((p) => ({ ...p })) }
    strokes.value = strokes.value.filter((_, i) => i !== index)
    movingStroke.value = { index, last: { x: point.x, y: point.y }, snapshot, moved: false }
    return true
  }

  /** Сдвинуть перетаскиваемый объект под новую (world) точку. */
  function moveStrokeBy(point: DrawPoint) {
    const m = movingStroke.value
    if (!m || !activeStroke.value) return
    const dx = point.x - m.last.x
    const dy = point.y - m.last.y
    if (dx === 0 && dy === 0) return
    movingStroke.value = { ...m, last: { x: point.x, y: point.y }, moved: true }
    activeStroke.value = {
      ...activeStroke.value,
      points: activeStroke.value.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    }
  }

  /** Завершить перетаскивание: вернуть штрих в массив на исходную позицию. */
  function endMoveStroke() {
    const m = movingStroke.value
    const moved = activeStroke.value
    movingStroke.value = null
    activeStroke.value = null
    if (!m || !moved) return
    if (m.moved) {
      // Снимок ДО перемещения → корректный undo. redo сбрасываем.
      history.undoStack.value.push(m.snapshot)
      if (history.undoStack.value.length > 100) history.undoStack.value.shift()
      history.redoStack.value = []
    }
    const next = [...strokes.value]
    next.splice(Math.min(m.index, next.length), 0, moved)
    strokes.value = next
  }

  function eraseAt(point: DrawPoint) {
    const idx = hitTestStrokeIndex(strokes.value, point, false)
    if (idx < 0) return
    history.pushHistory()
    strokes.value = strokes.value.filter((_, i) => i !== idx)
  }

  function beginStroke(event: PointerEvent) {
    if (!overlayEl.value) return
    // `hand`/`select` обрабатываются в DrawView и не начинают штрих.
    if (tool.value === 'hand' || tool.value === 'select') return
    // `text` открывает редактируемый оверлей вместо рисования штриха.
    if (tool.value === 'text') {
      beginText(pointFromEvent(event, overlayEl.value))
      return
    }
    event.preventDefault()
    const point = pointFromEvent(event, overlayEl.value)

    if (tool.value === 'eraser') {
      eraseAt(point)
      return
    }

    isDrawing.value = true
    const strokeType = tool.value
    const isClosedShape = CLOSED_SHAPE_TYPES.includes(strokeType)
    const isGeometry = GEOMETRY_TYPES.includes(strokeType)
    activeStroke.value = {
      type: strokeType,
      points: [point, point],
      color: style.color.value,
      size: style.size.value,
      roughness: style.roughness.value,
      // Стабильный seed, чтобы hand-drawn «дрожание» roughjs не менялось
      // при перерисовке фигуры (preview/коммит/undo-redo).
      seed: Math.floor(Math.random() * 0x80000000),
      id: generateStrokeId(),
      // Поля стиля добавляем только при недефолтных значениях, чтобы не
      // засорять JSON и соответствовать правилам normalizeStroke.
      ...(isClosedShape && style.fillColor.value && style.fillColor.value !== 'transparent' ? { fillColor: style.fillColor.value } : {}),
      ...(isClosedShape && style.fillStyle.value !== 'hachure' ? { fillStyle: style.fillStyle.value } : {}),
      ...(isGeometry && style.strokeStyle.value !== 'solid' ? { strokeStyle: style.strokeStyle.value } : {}),
      ...(style.opacity.value < 1 ? { opacity: style.opacity.value } : {}),
      ...(strokeType === 'arrow' && style.arrowShape.value !== 'straight' ? { arrowShape: style.arrowShape.value } : {}),
      ...(strokeType === 'arrow' && style.startCap.value !== 'none' ? { startCap: style.startCap.value } : {}),
      ...(strokeType === 'arrow' && style.endCap.value !== 'arrow' ? { endCap: style.endCap.value } : {}),
    }
    // Привязка начала стрелки к фигуре под курсором.
    if (strokeType === 'arrow') {
      const startAnchor = hitTestBindableId(strokes.value, point)
      if (startAnchor) activeStroke.value = { ...activeStroke.value, startBinding: { strokeId: startAnchor } }
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

    if (isFreehandType(activeStroke.value.type)) {
      // Accumulate every sample for pressure-sensitive smoothing.
      activeStroke.value.points.push(point)
    } else {
      // Geometry: keep only the anchor + the current endpoint.
      const pts = activeStroke.value.points
      const constrained = event.shiftKey
        ? constrainGeometryPoint(activeStroke.value.type as import('../../../utils/draw/drawEngine').DrawTool, pts[0], point)
        : point
      pts[1] = constrained
      // Обновляем кандидата привязки для стрелки (подсветка целевой фигуры).
      if (activeStroke.value.type === 'arrow') {
        bindCandidateId.value = hitTestBindableId(strokes.value, pts[1])
      }
    }
    // Trigger reactivity for the live preview overlay.
    activeStroke.value = { ...activeStroke.value, points: [...activeStroke.value.points] }
  }

  function endStroke(event: PointerEvent) {
    if (!isDrawing.value || !activeStroke.value) {
      isDrawing.value = false
      activeStroke.value = null
      bindCandidateId.value = null
      return
    }
    event?.preventDefault()
    overlayEl.value?.releasePointerCapture?.(event.pointerId)

    // Drop degenerate strokes (click without drag on geometry).
    const pts = activeStroke.value.points
    if (!isFreehandType(activeStroke.value.type) && pts.length >= 2) {
      const [a, b] = pts
      if (Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2) {
        isDrawing.value = false
        activeStroke.value = null
        bindCandidateId.value = null
        return
      }
    }

    // Привязка конца стрелки к фигуре под курсором.
    if (activeStroke.value.type === 'arrow') {
      const endAnchor = hitTestBindableId(strokes.value, activeStroke.value.points[1])
      if (endAnchor) activeStroke.value = { ...activeStroke.value, endBinding: { strokeId: endAnchor } }
    }

    // Авто-распознавание фигур, если включено и штрих - карандаш (freehand)
    if (autoDetectShapes.value && activeStroke.value.type === 'freehand') {
      const recognized = recognizeShape(activeStroke.value.points)
      if (recognized) {
        const isClosedShape = CLOSED_SHAPE_TYPES.includes(recognized.type)
        const isGeometry = GEOMETRY_TYPES.includes(recognized.type)
        activeStroke.value = {
          ...activeStroke.value,
          type: recognized.type,
          points: recognized.points,
          // Применяем текущие настройки заливки и стиля линии для геометрической фигуры
          ...(isClosedShape && style.fillColor.value && style.fillColor.value !== 'transparent' ? { fillColor: style.fillColor.value } : {}),
          ...(isClosedShape && style.fillStyle.value !== 'hachure' ? { fillStyle: style.fillStyle.value } : {}),
          ...(isGeometry && style.strokeStyle.value !== 'solid' ? { strokeStyle: style.strokeStyle.value } : {}),
        }
      }
    }

    history.pushHistory()
    strokes.value = [...strokes.value, activeStroke.value]
    // Рефлоу: приклеить концы привязанных стрелок к краям якорных фигур.
    strokes.value = reflowBoundArrows(strokes.value)
    isDrawing.value = false
    activeStroke.value = null
    bindCandidateId.value = null
  }

  /** Попытаться начать перетаскивание объекта под курсором (инструмент «рука»).
   *  Возвращает true, если объект схвачен (DrawView не должен панорамировать). */
  function tryBeginMove(event: PointerEvent): boolean {
    if (!overlayEl.value) return false
    const point = pointFromEvent(event, overlayEl.value)
    if (!beginMoveStroke(point)) return false
    event.preventDefault()
    overlayEl.value.setPointerCapture?.(event.pointerId)
    return true
  }

  /** Обработчик pointermove во время перетаскивания объекта. */
  function moveStrokeAt(event: PointerEvent) {
    if (!overlayEl.value || !movingStroke.value) return
    event.preventDefault()
    moveStrokeBy(pointFromEvent(event, overlayEl.value))
  }

  /** Завершить перетаскивание объекта (pointerup/leave) и сохранить результат. */
  function endMove(event: PointerEvent) {
    overlayEl.value?.releasePointerCapture?.(event.pointerId)
    endMoveStroke()
    scheduleSave()
  }

  function insertImageStroke(input: InsertImageInput): string | null {
    const { assetSrc, naturalWidth, naturalHeight } = input
    if (!assetSrc || !(naturalWidth > 0) || !(naturalHeight > 0)) return null
    const { w, h } = camera.viewportSize()
    const scale = camera.camera.value.scale || 1
    // Целевая ширина в world: не больше 60% видимой области и не больше натуральной.
    const maxWorldW = (w / scale) * 0.6
    const maxWorldH = (h / scale) * 0.6
    const aspect = naturalWidth / naturalHeight
    let worldW = Math.min(naturalWidth, maxWorldW)
    let worldH = worldW / aspect
    if (worldH > maxWorldH) { worldH = maxWorldH; worldW = worldH * aspect }
    const cx = input.center?.x ?? (w / 2 - camera.camera.value.x) / scale
    const cy = input.center?.y ?? (h / 2 - camera.camera.value.y) / scale
    const x0 = cx - worldW / 2
    const y0 = cy - worldH / 2
    const id = generateStrokeId()
    const imgStroke: DrawStroke = {
      type: 'image',
      points: [{ x: x0, y: y0 }, { x: x0 + worldW, y: y0 + worldH }],
      color: 'transparent',
      size: 1,
      assetSrc,
      naturalWidth,
      naturalHeight,
      id,
    }
    history.pushHistory()
    strokes.value = [...strokes.value, imgStroke]
    tool.value = 'select'
    selection.selectOnly(id)
    scheduleSave()
    return id
  }

  /** Вставить готовый шаблон (массив примитивов в локальных координатах):
   *  центрирует его во вьюпорте, присваивает новые уникальные id, объединяет в
   *  одну группу (если штрихов ≥2) и выделяет результат инструментом «выбор».
   *  Возвращает id первого вставленного штриха (или null для пустого шаблона). */
  function insertTemplate(template: DrawStroke[]): string | null {
    if (!template.length) return null
    // bbox шаблона в его локальных координатах.
    const b = computeBounds(template)
    const { w, h } = camera.viewportSize()
    const scale = camera.camera.value.scale || 1
    // Центр видимой области в world-координатах.
    const cx = (w / 2 - camera.camera.value.x) / scale
    const cy = (h / 2 - camera.camera.value.y) / scale
    const dx = cx - (b.minX + b.maxX) / 2
    const dy = cy - (b.minY + b.maxY) / 2
    // Единый groupId — только если в шаблоне больше одного штриха.
    const groupId = template.length >= 2 ? generateStrokeId() : undefined
    const inserted: DrawStroke[] = template.map((s) => ({
      ...s,
      id: generateStrokeId(),
      ...(groupId ? { groupId } : {}),
      points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
      seed: typeof s.seed === 'number' ? s.seed : Math.floor(Math.random() * 0x80000000),
    }))
    const firstId = inserted[0].id!
    history.pushHistory()
    strokes.value = [...strokes.value, ...inserted]
    tool.value = 'select'
    // selectOnly расширяет выбор по groupId — выделится весь шаблон целиком.
    selection.selectOnly(firstId)
    scheduleSave()
    return firstId
  }

  /** World-точка из pointer-события (через overlay CTM). Для DrawView. */
  function eventToWorld(event: PointerEvent): DrawPoint {
    return overlayEl.value ? pointFromEvent(event, overlayEl.value) : { x: 0, y: 0 }
  }

  return {
    activeStroke,
    isDrawing,
    bindCandidateId,
    isMovingStroke,
    beginStroke,
    moveStroke,
    endStroke,
    eraseAt,
    tryBeginMove,
    moveStrokeAt,
    endMove,
    insertImageStroke,
    insertTemplate,
    eventToWorld,
  }
}
