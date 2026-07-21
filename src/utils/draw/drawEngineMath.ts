/**
 * drawEngineMath — чистая геометрия для блока `draw_block`: bounding box
 * (с учётом поворота), вращение точек, пересечения прямоугольников, привязка
 * концов стрелок к фигурам, отражение/сдвиг штрихов и построение геометрии
 * стрелок-коннекторов. Никакого DOM/рендера — только вычисления над моделью.
 */

import {
  type DrawStroke,
  type DrawPoint,
  type DrawBinding,
  type DrawArrowShape,
  type DrawRect,
  TEXT_FONT_SCALE,
  DEFAULT_STROKE_SIZE,
  TEXT_LINE_HEIGHT,
} from './drawEngineTypes'

/** Приблизительный размер шрифта (в координатах холста) текстового штриха. */
export function textFontSize(stroke: DrawStroke): number {
  if (typeof stroke.fontSize === 'number' && stroke.fontSize > 0) {
    return stroke.fontSize
  }
  return (stroke.size || DEFAULT_STROKE_SIZE) * TEXT_FONT_SCALE
}

/** Неповёрнутый осенаправленный bbox штриха (без учёта rotation). */
function strokeBBoxRaw(stroke: DrawStroke): { minX: number; minY: number; maxX: number; maxY: number } {
  if (stroke.type === 'text') {
    const p = stroke.points[0] ?? { x: 0, y: 0 }
    const fontSize = textFontSize(stroke)
    const lines = (stroke.text ?? '').split('\n')
    // 0.6em — грубая средняя ширина символа моноширинного приближения.
    const w = Math.max(1, ...lines.map((l) => l.length)) * fontSize * 0.6
    const h = Math.max(1, lines.length) * fontSize * TEXT_LINE_HEIGHT
    return { minX: p.x, minY: p.y, maxX: p.x + w, maxY: p.y + h }
  }
  const xs = stroke.points.map((p) => p.x)
  const ys = stroke.points.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

/** Центр штриха (центр неповёрнутого bbox) — пивот поворота. */
export function strokeCenter(stroke: DrawStroke): { x: number; y: number } {
  const b = strokeBBoxRaw(stroke)
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 }
}

/** Повернуть точку вокруг центра на угол (радианы). */
export function rotatePoint(p: { x: number; y: number }, c: { x: number; y: number }, angle: number): { x: number; y: number } {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const dx = p.x - c.x
  const dy = p.y - c.y
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
}

/** Охватывающий прямоугольник штриха с учётом поворота (AABB повёрнутых углов).
 *  Для текста/фигур — приблизительный бокс. Используется для выделения,
 *  hit-test, ластика, fit-to-content. */
export function strokeBBox(stroke: DrawStroke): { minX: number; minY: number; maxX: number; maxY: number } {
  const raw = strokeBBoxRaw(stroke)
  const rot = stroke.rotation
  if (!rot) return raw
  const c = { x: (raw.minX + raw.maxX) / 2, y: (raw.minY + raw.maxY) / 2 }
  const corners = [
    { x: raw.minX, y: raw.minY }, { x: raw.maxX, y: raw.minY },
    { x: raw.maxX, y: raw.maxY }, { x: raw.minX, y: raw.maxY },
  ].map((p) => rotatePoint(p, c, rot))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) }
}

/** Вычисляет точку пересечения луча из центра bbox фигуры в направлении `toward`
 *  с границей bbox, расширенного на `gap`. Иммутабельно — фигура не мутируется.
 *
 *  Используется для привязки конца стрелки: конец ставится на поверхность фигуры
 *  с заданным зазором, а не в центр. */
export function arrowEndpointOnShape(shape: DrawStroke, toward: DrawPoint, gap = 4): DrawPoint {
  const raw = strokeBBox(shape)
  const minX = raw.minX - gap
  const minY = raw.minY - gap
  const maxX = raw.maxX + gap
  const maxY = raw.maxY + gap
  const c = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-6) return { x: c.x, y: c.y }
  // Найти минимальный положительный t пересечения луча c + t*d с AABB.
  let t = Infinity
  // Правая сторона: x = maxX
  if (dx !== 0) {
    const tR = (maxX - c.x) / dx
    if (tR > 0) {
      const y = c.y + tR * dy
      if (y >= minY && y <= maxY && tR < t) t = tR
    }
    // Левая сторона: x = minX
    const tL = (minX - c.x) / dx
    if (tL > 0) {
      const y = c.y + tL * dy
      if (y >= minY && y <= maxY && tL < t) t = tL
    }
  }
  // Нижняя сторона: y = maxY
  if (dy !== 0) {
    const tB = (maxY - c.y) / dy
    if (tB > 0) {
      const x = c.x + tB * dx
      if (x >= minX && x <= maxX && tB < t) t = tB
    }
    // Верхняя сторона: y = minY
    const tT = (minY - c.y) / dy
    if (tT > 0) {
      const x = c.x + tT * dx
      if (x >= minX && x <= maxX && tT < t) t = tT
    }
  }
  if (!Number.isFinite(t)) return { x: c.x, y: c.y }
  return { x: c.x + t * dx, y: c.y + t * dy }
}

/** Пересчитывает концы привязанных стрелок по текущим позициям якорных фигур.
 *  Если якорная фигура не найдена — привязка снимается.
 *  Иммутабельно: не мутирует вход; возвращает новый массив (map). */
export function reflowBoundArrows(strokes: DrawStroke[]): DrawStroke[] {
  const byId = new Map(strokes.filter((s) => s.id).map((s) => [s.id!, s]))
  return strokes.map((s) => {
    if (s.type !== 'arrow') return s
    if (!s.startBinding && !s.endBinding) return s
    const pts = s.points.map((p) => ({ ...p }))
    let changed = false
    let startBinding: DrawBinding | undefined = s.startBinding
    let endBinding: DrawBinding | undefined = s.endBinding

    // Обрабатываем startBinding первым, чтобы endBinding мог использовать обновлённый pts[0].
    if (startBinding) {
      const shape = byId.get(startBinding.strokeId)
      if (!shape) {
        // Якорь исчез — снять привязку.
        startBinding = undefined
        changed = true
      } else {
        // «Другой конец» для startBinding — это points[1] (или его копия).
        const otherEnd = pts[1]
        const newPt = arrowEndpointOnShape(shape, otherEnd, startBinding.gap ?? 4)
        if (newPt.x !== pts[0].x || newPt.y !== pts[0].y) {
          pts[0] = newPt
          changed = true
        }
      }
    }

    if (endBinding) {
      const shape = byId.get(endBinding.strokeId)
      if (!shape) {
        // Якорь исчез — снять привязку.
        endBinding = undefined
        changed = true
      } else {
        // «Другой конец» для endBinding — обновлённый pts[0].
        const otherEnd = pts[0]
        const newPt = arrowEndpointOnShape(shape, otherEnd, endBinding.gap ?? 4)
        if (newPt.x !== pts[1].x || newPt.y !== pts[1].y) {
          pts[1] = newPt
          changed = true
        }
      }
    }

    if (!changed) return s

    // Собираем результат; снятые привязки реально убираем через деструктуризацию.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { startBinding: _sb, endBinding: _eb, ...rest } = s
    return {
      ...rest,
      points: pts,
      ...(startBinding ? { startBinding } : {}),
      ...(endBinding ? { endBinding } : {}),
    }
  })
}

/** Сдвиг всех точек штриха на (dx, dy). Иммутабельно — исходный объект не мутируется. */
export function translateStroke(stroke: DrawStroke, dx: number, dy: number): DrawStroke {
  return { ...stroke, points: stroke.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) }
}

/** Отражение штриха относительно оси. Иммутабельно.
 *
 * - `axis 'h'` — вертикальная ось x=center (горизонтальный flip): x' = 2*center - x.
 * - `axis 'v'` — горизонтальная ось y=center (вертикальный flip): y' = 2*center - y.
 *
 * Поворот при наличии инвертируется (зеркало меняет знак угла).
 *
 * Для текстовых штрихов точки-якорь не отражаются «в лоб» (текст смещается
 * зеркально-неправильно) — вместо этого отражается позиция bbox: новый левый/
 * верхний край вычисляется из отражённого правого/нижнего края, а глифы
 * остаются нечитаемы в зеркале (текст не переворачивается посимвольно). */
export function reflectStroke(stroke: DrawStroke, axis: 'h' | 'v', center: number): DrawStroke {
  // Инвертируем rotation если задан (зеркало меняет знак угла).
  const newRotation = typeof stroke.rotation === 'number' ? -stroke.rotation : stroke.rotation

  // Для текста: отражаем позицию bbox, а не сырые точки (иначе якорь уедет
  // за границу своей же ширины/высоты и текст отрисуется некорректно).
  if (stroke.type === 'text') {
    const b = strokeBBox(stroke)
    if (axis === 'h') {
      // Новый левый край = 2*center - правый край bbox.
      const x0 = 2 * center - b.maxX
      const dx = x0 - b.minX
      const moved = translateStroke(stroke, dx, 0)
      return typeof newRotation === 'number'
        ? { ...moved, rotation: newRotation === 0 ? undefined : newRotation }
        : moved
    } else {
      // Новый верхний край = 2*center - нижний край bbox.
      const y0 = 2 * center - b.maxY
      const dy = y0 - b.minY
      const moved = translateStroke(stroke, 0, dy)
      return typeof newRotation === 'number'
        ? { ...moved, rotation: newRotation === 0 ? undefined : newRotation }
        : moved
    }
  }

  // Общий случай: отражаем каждую точку по выбранной оси.
  const reflectedPoints = stroke.points.map((p) =>
    axis === 'h'
      ? { ...p, x: 2 * center - p.x }
      : { ...p, y: 2 * center - p.y },
  )

  // Собираем результирующий объект; rotation добавляем только если он был задан.
  const result: DrawStroke = { ...stroke, points: reflectedPoints }
  if (typeof stroke.rotation === 'number') {
    // Ноль после инверсии (0 → -0 в JS) трактуем как «нет поворота».
    if (newRotation !== 0) {
      result.rotation = newRotation
    } else {
      delete result.rotation
    }
  }
  return result
}

/** Пересекаются ли два прямоугольника (AABB). Касание краёв считается пересечением. */
export function rectsIntersect(a: DrawRect, b: DrawRect): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

/** Размеры охватывающего прямоугольника всех штрихов (для viewBox). */
export function computeBounds(strokes: DrawStroke[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (strokes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    const b = strokeBBox(stroke)
    if (b.minX < minX) minX = b.minX
    if (b.minY < minY) minY = b.minY
    if (b.maxX > maxX) maxX = b.maxX
    if (b.maxY > maxY) maxY = b.maxY
  }
  return { minX, minY, maxX, maxY }
}

export interface ArrowGeometry {
  shape: DrawArrowShape
  /** Полилиния тела: straight=2, orthogonal=3-4, bezier=~17 сэмплов. */
  points: DrawPoint[]
  /** Контрольная точка квадратичной кривой (только bezier). */
  control?: DrawPoint
  /** Конец стрелки = to. */
  tip: DrawPoint
  /** Точка перед tip — задаёт угол наконечника. */
  tangent: DrawPoint
  /** Середина кривой (t=0.5) — позиция drag-ручки изгиба (только bezier). */
  apex?: DrawPoint
}

/** Единый источник геометрии стрелки-коннектора.
 *  Используется и рендером, и UI drag-ручкой изгиба. */
export function buildArrowGeometry(
  from: DrawPoint,
  to: DrawPoint,
  shape: DrawArrowShape = 'straight',
  bend?: number,
): ArrowGeometry {
  if (shape === 'orthogonal') {
    const dx = to.x - from.x
    const dy = to.y - from.y
    if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
      // Вырожденный случай — как straight.
      return {
        shape: 'orthogonal',
        points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }],
        tip: { x: to.x, y: to.y },
        tangent: { x: from.x, y: from.y },
      }
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      // Горизонталь первой.
      const midX = (from.x + to.x) / 2
      const pts: DrawPoint[] = [
        { x: from.x, y: from.y },
        { x: midX, y: from.y },
        { x: midX, y: to.y },
        { x: to.x, y: to.y },
      ]
      return {
        shape: 'orthogonal',
        points: pts,
        tip: { x: to.x, y: to.y },
        tangent: pts[pts.length - 2],
      }
    } else {
      // Вертикаль первой.
      const midY = (from.y + to.y) / 2
      const pts: DrawPoint[] = [
        { x: from.x, y: from.y },
        { x: from.x, y: midY },
        { x: to.x, y: midY },
        { x: to.x, y: to.y },
      ]
      return {
        shape: 'orthogonal',
        points: pts,
        tip: { x: to.x, y: to.y },
        tangent: pts[pts.length - 2],
      }
    }
  }

  if (shape === 'bezier') {
    const mid: DrawPoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
    const dx = to.x - from.x
    const dy = to.y - from.y
    const len = Math.hypot(dx, dy)
    if (len < 1e-6) {
      // Вырожденный случай — как straight.
      return {
        shape: 'bezier',
        points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }],
        tip: { x: to.x, y: to.y },
        tangent: { x: from.x, y: from.y },
      }
    }
    // Единичная перпендикуляр (повёрнутый влево от направления from→to).
    const nx = -dy / len
    const ny = dx / len
    const b = typeof bend === 'number' && Number.isFinite(bend) ? bend : 0.2 * len
    const control: DrawPoint = { x: mid.x + nx * b, y: mid.y + ny * b }
    const apex: DrawPoint = { x: mid.x + nx * (b / 2), y: mid.y + ny * (b / 2) }
    // Сэмплируем квадратичную Безье: B(t) = (1-t)^2*from + 2(1-t)t*ctrl + t^2*to
    const STEPS = 16
    const pts: DrawPoint[] = []
    for (let i = 0; i <= STEPS; i++) {
      const t = i / STEPS
      const mt = 1 - t
      pts.push({
        x: mt * mt * from.x + 2 * mt * t * control.x + t * t * to.x,
        y: mt * mt * from.y + 2 * mt * t * control.y + t * t * to.y,
      })
    }
    return {
      shape: 'bezier',
      points: pts,
      control,
      tip: { x: to.x, y: to.y },
      tangent: control,
      apex,
    }
  }

  // straight (дефолт).
  return {
    shape: 'straight',
    points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }],
    tip: { x: to.x, y: to.y },
    tangent: { x: from.x, y: from.y },
  }
}
