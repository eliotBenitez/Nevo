import { shallowRef, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { DrawStroke, DrawRect } from '../../../utils/draw/drawEngine'
import { cloneStrokes, computeResize, scaleStroke, rotateStrokeAround } from './drawGeometry'
import type { DrawPoint } from './drawGeometry'
import type { ResizeHandle } from './useDrawSelection'
import type { DrawHistory } from './useDrawHistory'
import type { DrawSelection } from './useDrawSelection'

export interface DrawSelectionTransforms {
  isMovingSelection: ComputedRef<boolean>
  isResizingSelection: ComputedRef<boolean>
  isRotatingSelection: ComputedRef<boolean>
  selectionCenterWorld(): DrawPoint | null
  beginMoveSelection(point: DrawPoint): boolean
  moveSelectionTo(point: DrawPoint): void
  endMoveSelection(): void
  beginResizeSelection(handle: ResizeHandle, point: DrawPoint): boolean
  resizeSelectionTo(point: DrawPoint, constrain?: boolean): void
  endResizeSelection(): void
  beginRotateSelection(point: DrawPoint): boolean
  rotateSelectionTo(point: DrawPoint): void
  endRotateSelection(): void
  beginBendArrow(): boolean
  bendArrowTo(point: DrawPoint): void
  endBendArrow(): void
}

export function createDrawSelectionTransforms(opts: {
  strokes: Ref<DrawStroke[]>
  selection: DrawSelection
  history: DrawHistory
}): DrawSelectionTransforms {
  const { strokes, selection, history } = opts

  // --- Перемещение выделения ---
  const moveSel = shallowRef<{ last: DrawPoint; snapshot: DrawStroke[]; moved: boolean } | null>(null)
  const isMovingSelection = computed(() => moveSel.value !== null)

  function beginMoveSelection(point: DrawPoint): boolean {
    if (!selection.selection.value.size) return false
    moveSel.value = { last: { x: point.x, y: point.y }, snapshot: cloneStrokes(strokes.value), moved: false }
    return true
  }
  function moveSelectionTo(point: DrawPoint) {
    const g = moveSel.value
    if (!g) return
    const dx = point.x - g.last.x
    const dy = point.y - g.last.y
    if (dx === 0 && dy === 0) return
    moveSel.value = { ...g, last: { x: point.x, y: point.y }, moved: true }
    strokes.value = strokes.value.map((s) =>
      s.id && selection.selection.value.has(s.id) && !s.locked
        ? { ...s, points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) }
        : s,
    )
    selection.reflowArrows()
  }
  function endMoveSelection() {
    const g = moveSel.value
    moveSel.value = null
    if (g?.moved) history.commitHistory(g.snapshot)
  }

  // --- Ресайз выделения ---
  const resizeSel = shallowRef<{ handle: ResizeHandle; startBox: DrawRect; startStrokes: DrawStroke[]; snapshot: DrawStroke[]; moved: boolean } | null>(null)
  const isResizingSelection = computed(() => resizeSel.value !== null)

  function beginResizeSelection(handle: ResizeHandle, _point: DrawPoint): boolean {
    const box = selection.selectionBox.value
    if (!box) return false
    resizeSel.value = {
      handle,
      startBox: { ...box },
      startStrokes: cloneStrokes(selection.selectedStrokes()),
      snapshot: cloneStrokes(strokes.value),
      moved: false,
    }
    return true
  }
  function resizeSelectionTo(point: DrawPoint, constrain = false) {
    const g = resizeSel.value
    if (!g) return
    const resize = computeResize(g.handle, g.startBox, point)
    const { originX, originY } = resize
    let { scaleX, scaleY } = resize
    // Shift-констрейн для угловых маркеров: приравниваем масштабы, чтобы
    // сохранить пропорции (квадратный масштаб).
    if (constrain) {
      const isCorner = (g.handle.includes('n') || g.handle.includes('s')) &&
                       (g.handle.includes('e') || g.handle.includes('w'))
      if (isCorner) {
        const m = Math.max(scaleX, scaleY)
        scaleX = m
        scaleY = m
      }
    }
    g.moved = true
    resizeSel.value = g
    const startMap = new Map(g.startStrokes.map((s) => [s.id, s]))
    strokes.value = strokes.value.map((s) => {
      if (!(s.id && selection.selection.value.has(s.id) && !s.locked)) return s
      const start = startMap.get(s.id)
      return start ? scaleStroke(start, scaleX, scaleY, originX, originY) : s
    })
    selection.reflowArrows()
  }
  function endResizeSelection() {
    const g = resizeSel.value
    resizeSel.value = null
    if (g?.moved) history.commitHistory(g.snapshot)
  }

  // --- Поворот выделения ---
  const rotateSel = shallowRef<{ center: DrawPoint; startAngle: number; startStrokes: DrawStroke[]; snapshot: DrawStroke[]; moved: boolean } | null>(null)
  const isRotatingSelection = computed(() => rotateSel.value !== null)

  /** Центр выделения (центр его bbox) в world-координатах — пивот поворота. */
  function selectionCenterWorld(): DrawPoint | null {
    const box = selection.selectionBox.value
    if (!box) return null
    return { x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }
  }

  function beginRotateSelection(point: DrawPoint): boolean {
    const center = selectionCenterWorld()
    if (!center) return false
    rotateSel.value = {
      center,
      startAngle: Math.atan2(point.y - center.y, point.x - center.x),
      startStrokes: cloneStrokes(selection.selectedStrokes()),
      snapshot: cloneStrokes(strokes.value),
      moved: false,
    }
    return true
  }
  function rotateSelectionTo(point: DrawPoint) {
    const g = rotateSel.value
    if (!g) return
    const theta = Math.atan2(point.y - g.center.y, point.x - g.center.x) - g.startAngle
    g.moved = true
    rotateSel.value = g
    const startMap = new Map(g.startStrokes.map((s) => [s.id, s]))
    strokes.value = strokes.value.map((s) => {
      if (!(s.id && selection.selection.value.has(s.id) && !s.locked)) return s
      const start = startMap.get(s.id)
      return start ? rotateStrokeAround(start, g.center, theta) : s
    })
    selection.reflowArrows()
  }
  function endRotateSelection() {
    const g = rotateSel.value
    rotateSel.value = null
    if (g?.moved) history.commitHistory(g.snapshot)
  }

  // --- Drag-ручка изгиба bezier-стрелки ---
  const bendSel = shallowRef<{ id: string; from: DrawPoint; to: DrawPoint; snapshot: DrawStroke[]; moved: boolean } | null>(null)

  function beginBendArrow(): boolean {
    const sel = selection.selectedStrokes()
    if (sel.length !== 1) return false
    const s = sel[0]
    if (s.type !== 'arrow' || s.arrowShape !== 'bezier' || !s.id) return false
    const from = s.points[0]; const to = s.points[1]
    if (!from || !to) return false
    bendSel.value = { id: s.id, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, snapshot: cloneStrokes(strokes.value), moved: false }
    return true
  }

  function bendArrowTo(point: DrawPoint) {
    const g = bendSel.value
    if (!g) return
    const dx = g.to.x - g.from.x
    const dy = g.to.y - g.from.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) return
    const nx = -dy / len; const ny = dx / len
    const mid = { x: (g.from.x + g.to.x) / 2, y: (g.from.y + g.to.y) / 2 }
    const s = (point.x - mid.x) * nx + (point.y - mid.y) * ny
    const bend = 2 * s
    g.moved = true
    bendSel.value = g
    strokes.value = strokes.value.map((st) => (st.id === g.id ? { ...st, bend } : st))
  }

  function endBendArrow() {
    const g = bendSel.value
    bendSel.value = null
    if (g?.moved) history.commitHistory(g.snapshot)
  }

  return {
    isMovingSelection,
    isResizingSelection,
    isRotatingSelection,
    selectionCenterWorld,
    beginMoveSelection,
    moveSelectionTo,
    endMoveSelection,
    beginResizeSelection,
    resizeSelectionTo,
    endResizeSelection,
    beginRotateSelection,
    rotateSelectionTo,
    endRotateSelection,
    beginBendArrow,
    bendArrowTo,
    endBendArrow,
  }
}
