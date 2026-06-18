/**
 * drawEngine — чистый (DOM/события-агностик) движок рисования для блока
 * `draw_block`. Точки/штрихи хранятся как компактный JSON-массив и
 * рендерятся в SVG через roughjs (hand-drawn геометрия) и perfect-freehand
 * (pressure-sensitive штрихи). Библиотеки грузятся лениво, чтобы не
 * утяжелять стартовый бандл (по образцу mermaid/markmap).
 *
 * Формат данных стабилен и версионирован — см. `DrawData.version`.
 */

export type DrawTool = 'freehand' | 'rectangle' | 'line' | 'arrow' | 'ellipse'

/** Одна точка ввода (pointer event). `p` — давление, 0..1 (опц.). */
export interface DrawPoint {
  x: number
  y: number
  /** Pressure 0..1, опционально (мышь → 0.5 по умолчанию). */
  p?: number
}

/** Один штрих фигуры. Для геометрии `points` = опорные точки (2+). */
export interface DrawStroke {
  type: DrawTool
  points: DrawPoint[]
  color: string
  size: number
  /** Hand-drawn «шероховатость» roughjs, 0..5 (только для геометрии). */
  roughness?: number
}

export interface DrawData {
  /** Версия формата. Бампится при несовместимых изменениях схемы. */
  version: 1
  strokes: DrawStroke[]
  /** Фон холста (CSS-цвет). По умолчанию прозрачный. */
  bgColor: string
}

export const DEFAULT_DRAW_DATA: DrawData = { version: 1, strokes: [], bgColor: 'transparent' }

/** Цвет по умолчанию для новых штрихов (тёмный «чернильный»). */
export const DEFAULT_STROKE_COLOR = '#1e1e1e'
export const DEFAULT_STROKE_SIZE = 3
export const DEFAULT_ROUGHNESS = 1.5

// --- Идентификаторы -------------------------------------------------------

/** Стабильный id рисунка (используется в атрибуте ноды + имени ассета). */
export function generateDrawId(): string {
  // crypto.randomUUID доступен в Tauri WebView (современный WebKit) и в jsdom-тестах.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// --- Сериализация ---------------------------------------------------------

export function serializeDrawData(data: DrawData): string {
  return JSON.stringify(data)
}

export function parseDrawData(json: string): DrawData {
  if (!json.trim()) return { ...DEFAULT_DRAW_DATA }
  try {
    const parsed = JSON.parse(json) as Partial<DrawData>
    const version = parsed.version === 1 ? 1 : 1
    const strokes = Array.isArray(parsed.strokes)
      ? parsed.strokes.filter(isValidStroke).map(normalizeStroke)
      : []
    const bgColor = typeof parsed.bgColor === 'string' ? parsed.bgColor : 'transparent'
    return { version, strokes, bgColor }
  } catch {
    return { ...DEFAULT_DRAW_DATA }
  }
}

function isValidStroke(value: unknown): value is DrawStroke {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  if (!Array.isArray(s.points) || s.points.length === 0) return false
  if (typeof s.color !== 'string' || typeof s.size !== 'number') return false
  return Array.isArray(s.points) && s.points.every(isValidPoint)
}

function isValidPoint(value: unknown): value is DrawPoint {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return typeof p.x === 'number' && typeof p.y === 'number'
}

function normalizeStroke(stroke: DrawStroke): DrawStroke {
  return {
    type: stroke.type,
    points: stroke.points.map((p) => ({ x: p.x, y: p.y, ...(typeof p.p === 'number' ? { p: p.p } : {}) })),
    color: stroke.color,
    size: stroke.size,
    ...(typeof stroke.roughness === 'number' ? { roughness: stroke.roughness } : {}),
  }
}

// --- Рендеринг в SVG ------------------------------------------------------

/** Размеры охватывающего прямоугольника всех штрихов (для viewBox). */
export function computeBounds(strokes: DrawStroke[]): { minX: number; minY: number; maxX: number; maxY: number } {
  if (strokes.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const pt of stroke.points) {
      if (pt.x < minX) minX = pt.x
      if (pt.y < minY) minY = pt.y
      if (pt.x > maxX) maxX = pt.x
      if (pt.y > maxY) maxY = pt.y
    }
  }
  return { minX, minY, maxX, maxY }
}

/**
 * Рендерит массив штрихов в строку SVG-разметки (без <svg>-обёртки).
 * Возвращает содержимое для вставки внутрь <svg>. Используется и в
 * node-view (preview), и в экспорте. roughjs/perfect-freehand грузятся
 * лениво (dynamic import).
 */
export async function renderStrokesToSvgInner(strokes: DrawStroke[]): Promise<string> {
  if (strokes.length === 0) return ''
  const [{ RoughSVG }, { default: getStroke }] = await Promise.all([
    import('roughjs/bin/svg'),
    import('perfect-freehand'),
  ])

  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  // roughjs v4: RoughSVG конструируется от SVG-элемента.
  const rc = new RoughSVG(svgEl)

  const fragments: string[] = []
  for (const stroke of strokes) {
    const nodes = strokeToSvgNodes(stroke, rc, getStroke)
    for (const node of nodes) {
      fragments.push(serialiseXmlNode(node))
    }
  }
  return fragments.join('')
}

function strokeToSvgNodes(
  stroke: DrawStroke,
  rc: import('roughjs/bin/svg').RoughSVG,
  getStroke: typeof import('perfect-freehand')['default'],
): SVGGElement[] {
  const opts: import('roughjs/bin/core').Options = {
    stroke: stroke.color,
    strokeWidth: stroke.size,
    roughness: typeof stroke.roughness === 'number' ? stroke.roughness : DEFAULT_ROUGHNESS,
    fill: 'none',
  }

  if (stroke.type === 'freehand') {
    const strokePoints = getStroke(
      stroke.points.map((p) => [p.x, p.y, typeof p.p === 'number' ? p.p : 0.5]),
      { size: stroke.size * 3.2, thinning: 0.6, smoothing: 0.5, streamline: 0.5 },
    )
    const d = svgPathFromPoints(strokePoints)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', stroke.color)
    path.setAttribute('stroke', 'none')
    return [path as unknown as SVGGElement]
  }

  const pts = stroke.points
  if (pts.length < 2) return []

  if (stroke.type === 'line') {
    return [rc.line(pts[0].x, pts[0].y, pts[1].x, pts[1].y, opts)]
  }
  if (stroke.type === 'rectangle') {
    const { x, y, w, h } = rectFromTwoPoints(pts[0], pts[1])
    return [rc.rectangle(x, y, w, h, opts)]
  }
  if (stroke.type === 'ellipse') {
    const { x, y, w, h } = rectFromTwoPoints(pts[0], pts[1])
    return [rc.ellipse(x + w / 2, y + h / 2, w, h, opts)]
  }
  if (stroke.type === 'arrow') {
    return drawArrow(rc, pts[0], pts[1], opts)
  }
  return []
}

function rectFromTwoPoints(a: DrawPoint, b: DrawPoint): { x: number; y: number; w: number; h: number } {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  return { x, y, w: Math.max(w, 1), h: Math.max(h, 1) }
}

function drawArrow(
  rc: import('roughjs/bin/svg').RoughSVG,
  from: DrawPoint,
  to: DrawPoint,
  opts: import('roughjs/bin/core').Options,
): SVGGElement[] {
  const nodes: SVGGElement[] = [rc.line(from.x, from.y, to.x, to.y, opts)]
  const angle = Math.atan2(to.y - from.y, to.x - from.x)
  const headLen = Math.max(12, opts.strokeWidth ? opts.strokeWidth * 4 : 12)
  const headAngle = Math.PI / 7
  const a1 = angle - headAngle
  const a2 = angle + headAngle
  nodes.push(rc.line(to.x, to.y, to.x - headLen * Math.cos(a1), to.y - headLen * Math.sin(a1), opts))
  nodes.push(rc.line(to.x, to.y, to.x - headLen * Math.cos(a2), to.y - headLen * Math.sin(a2), opts))
  return nodes
}

/** Конвертирует массив [x,y] точек perfect-freehand в SVG-path `d`. */
export function svgPathFromPoints(points: number[][]): string {
  if (points.length === 0) return ''
  const d = points.reduce(
    (acc, [x0, y0], i, arr) => {
      if (i === 0) return `M ${x0},${y0}`
      const [x1, y1] = arr[i - 1]
      const mx = (x0 + x1) / 2
      const my = (y0 + y1) / 2
      return `${acc} Q ${x1},${y1} ${mx},${my}`
    },
    '',
  )
  const last = points[points.length - 1]
  return `${d} L ${last[0]},${last[1]} Z`
}

/** Сериализует SVG-узел в строку (без XML-декларации). */
function serialiseXmlNode(node: Node): string {
  const xmlSerializer = new XMLSerializer()
  return xmlSerializer.serializeToString(node)
}

/**
 * Рендерит полный <svg> (с viewBox и фоном) для preview в документе.
 * `padding` добавляет отступ вокруг содержимого.
 */
export async function renderDrawToSvgString(data: DrawData, padding = 16): Promise<string> {
  const { minX, minY, maxX, maxY } = computeBounds(data.strokes)
  const inner = await renderStrokesToSvgInner(data.strokes)
  const width = Math.max(maxX - minX, 1) + padding * 2
  const height = Math.max(maxY - minY, 1) + padding * 2
  const viewBox = `${minX - padding} ${minY - padding} ${width} ${height}`
  const bg = data.bgColor && data.bgColor !== 'transparent' ? `<rect x="${minX - padding}" y="${minY - padding}" width="${width}" height="${height}" fill="${data.bgColor}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" preserveAspectRatio="xMidYMid meet" class="nv-draw-preview">${bg}${inner}</svg>`
}
