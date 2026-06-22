import {
  strokeBBox,
  strokeCenter,
  rotatePoint,
  isBindableType,
  type DrawPoint,
  type DrawRect,
  type DrawStroke,
  type DrawTool,
  type DrawFillStyle,
  type DrawStrokeStyle,
} from '../../../utils/draw/drawEngine'

export type { DrawPoint, DrawRect, DrawStroke, DrawTool, DrawFillStyle, DrawStrokeStyle }

/** Замкнутые фигуры, которые поддерживают заливку. */
export const CLOSED_SHAPE_TYPES: DrawTool[] = ['rectangle', 'ellipse', 'diamond']

/** Типы геометрии (не freehand, не text), для которых применяется strokeStyle. */
export const GEOMETRY_TYPES: DrawTool[] = ['rectangle', 'ellipse', 'diamond', 'line', 'arrow']

/** Минимальный размер при ресайзе. */
export const RESIZE_MIN = 4

/**
 * Shift-констрейн для геометрических фигур при рисовании.
 * - Для замкнутых фигур (rectangle/ellipse/diamond): фиксирует квадрат.
 * - Для line/arrow: снапает угол к кратному 15°.
 */
export function constrainGeometryPoint(type: DrawTool, anchor: DrawPoint, point: DrawPoint): DrawPoint {
  const dx = point.x - anchor.x
  const dy = point.y - anchor.y
  if (CLOSED_SHAPE_TYPES.includes(type)) {
    // Квадрат: сторона равна максимальному из |dx|, |dy| с сохранением знака.
    const m = Math.max(Math.abs(dx), Math.abs(dy))
    return { x: anchor.x + Math.sign(dx || 1) * m, y: anchor.y + Math.sign(dy || 1) * m, p: point.p }
  }
  // line/arrow: снап к ближайшему кратному 15°.
  const ang = Math.atan2(dy, dx)
  const step = Math.PI / 12
  const snapped = Math.round(ang / step) * step
  const len = Math.hypot(dx, dy)
  return { x: anchor.x + Math.cos(snapped) * len, y: anchor.y + Math.sin(snapped) * len, p: point.p }
}

/** Вычислить масштаб + неподвижную точку (origin) из маркера и новой позиции. */
export function computeResize(handle: string, box: DrawRect, p: DrawPoint) {
  const hasW = handle.includes('w')
  const hasE = handle.includes('e')
  const hasN = handle.includes('n')
  const hasS = handle.includes('s')
  const startW = Math.max(box.maxX - box.minX, 1e-6)
  const startH = Math.max(box.maxY - box.minY, 1e-6)
  let originX = box.minX
  let originY = box.minY
  let scaleX = 1
  let scaleY = 1
  if (hasE) {
    originX = box.minX
    scaleX = Math.max(RESIZE_MIN, p.x - box.minX) / startW
  } else if (hasW) {
    originX = box.maxX
    scaleX = Math.max(RESIZE_MIN, box.maxX - p.x) / startW
  }
  if (hasS) {
    originY = box.minY
    scaleY = Math.max(RESIZE_MIN, p.y - box.minY) / startH
  } else if (hasN) {
    originY = box.maxY
    scaleY = Math.max(RESIZE_MIN, box.maxY - p.y) / startH
  }
  return { scaleX, scaleY, originX, originY }
}

/** Применить масштаб к штриху относительно origin. Для текста масштабируется
 *  и размер шрифта (по доминирующей оси), иначе текст не «растёт». */
export function scaleStroke(start: DrawStroke, sx: number, sy: number, ox: number, oy: number): DrawStroke {
  const points = start.points.map((p) => ({ ...p, x: ox + (p.x - ox) * sx, y: oy + (p.y - oy) * sy }))
  if (start.type === 'text') {
    const fontScale = sy !== 1 ? sy : sx
    return { ...start, points, size: Math.max(0.5, start.size * fontScale) }
  }
  return { ...start, points }
}

/** Повернуть штрих вокруг внешнего пивота: центр объекта летит по орбите,
 *  а сам объект докручивается на тот же угол (rotation += theta). */
export function rotateStrokeAround(start: DrawStroke, pivot: DrawPoint, theta: number): DrawStroke {
  const center = strokeCenter(start)
  const nc = rotatePoint(center, pivot, theta)
  const dx = nc.x - center.x
  const dy = nc.y - center.y
  return {
    ...start,
    points: start.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
    rotation: (start.rotation ?? 0) + theta,
  }
}

/** Глубокое копирование массива штрихов. */
export function cloneStrokes(list: DrawStroke[]): DrawStroke[] {
  return list.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }))
}

/** Преобразовать pointer-событие в world-точку через SVG CTM. */
export function pointFromEvent(event: PointerEvent, svg: SVGSVGElement): DrawPoint {
  const p = typeof event.pressure === 'number' && event.pressure > 0 ? event.pressure : 0.5
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

/** Индекс верхнего штриха под точкой (hit-test по bbox + запас на захват).
 *  Возвращает -1, если под курсором ничего нет.
 *  `includeLocked=false` — пропускать заблокированные штрихи (для ластика и
 *  инструмента «рука», чтобы locked-объекты нельзя было случайно сдвинуть/стереть). */
export function hitTestStrokeIndex(strokes: DrawStroke[], point: DrawPoint, includeLocked = true): number {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i]
    if (!includeLocked && s.locked) continue
    const b = strokeBBox(s)
    // Запас, чтобы тонкие линии/штрихи было легче «схватить».
    const pad = Math.max(s.size, 6)
    if (point.x >= b.minX - pad && point.x <= b.maxX + pad && point.y >= b.minY - pad && point.y <= b.maxY + pad) {
      return i
    }
  }
  return -1
}

/** id верхнего привязываемого штриха под точкой (фигуры/картинки/текст), исключая excludeId. null если нет. */
export function hitTestBindableId(strokes: DrawStroke[], point: DrawPoint, excludeId?: string): string | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i]
    if (!s.id || s.id === excludeId) continue
    if (!isBindableType(s.type)) continue
    const b = strokeBBox(s)
    const pad = Math.max(s.size, 6)
    if (point.x >= b.minX - pad && point.x <= b.maxX + pad && point.y >= b.minY - pad && point.y <= b.maxY + pad) return s.id
  }
  return null
}

/**
 * Распознавание геометрических фигур по массиву точек.
 * Возвращает тип фигуры и массив ключевых точек (обычно две точки: начало и конец для bbox/диагонали).
 */
export function recognizeShape(points: DrawPoint[]): { type: DrawTool; points: DrawPoint[] } | null {
  if (points.length < 6) return null

  // 1. Вычисляем Bounding Box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const w = maxX - minX
  const h = maxY - minY

  // Слишком мелкая фигура — не распознаем
  if (Math.max(w, h) < 25) return null

  // 2. Длина пути (периметр) и расстояние между концами
  let pathLength = 0
  for (let i = 0; i < points.length - 1; i++) {
    const dx = points[i + 1].x - points[i].x
    const dy = points[i + 1].y - points[i].y
    pathLength += Math.hypot(dx, dy)
  }

  const start = points[0]
  const end = points[points.length - 1]
  const distStartEnd = Math.hypot(end.x - start.x, end.y - start.y)

  // 3. Проверка на замкнутость
  const isClosed = distStartEnd < 0.25 * Math.max(w, h) || distStartEnd < 50

  if (isClosed) {
    if (w < 25 || h < 25) return null
    // Вычисляем площадь замкнутой фигуры по формуле Shoelace
    let area = 0
    const n = points.length
    for (let i = 0; i < n; i++) {
      const p1 = points[i]
      const p2 = points[(i + 1) % n]
      area += p1.x * p2.y - p2.x * p1.y
    }
    area = Math.abs(area) * 0.5
    const bboxArea = w * h
    const ratio = area / bboxArea

    // Определяем тип фигуры по отношению площадей
    if (ratio > 0.82) {
      return {
        type: 'rectangle',
        points: [{ x: minX, y: minY }, { x: maxX, y: maxY }]
      }
    } else if (ratio >= 0.62) {
      return {
        type: 'ellipse',
        points: [{ x: minX, y: minY }, { x: maxX, y: maxY }]
      }
    } else if (ratio >= 0.38) {
      return {
        type: 'diamond',
        points: [{ x: minX, y: minY }, { x: maxX, y: maxY }]
      }
    }
  } else {
    // 4. Незамкнутая фигура: проверяем на прямую линию
    if (pathLength / distStartEnd < 1.15) {
      return {
        type: 'line',
        points: [{ x: start.x, y: start.y }, { x: end.x, y: end.y }]
      }
    }
  }

  return null
}
