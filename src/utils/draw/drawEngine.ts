/**
 * drawEngine — агрегирующий фасад (публичный API) движка рисования для блока
 * `draw_block`. Реэкспортирует модель данных (`drawEngineTypes`), геометрию
 * (`drawEngineMath`) и SVG-рендер (`drawEngineRenderer`), а также владеет
 * (де)сериализацией/нормализацией `DrawData` и генерацией стабильных id.
 *
 * Точки/штрихи хранятся как компактный JSON-массив; формат данных стабилен и
 * версионирован — см. `DrawData.version`. roughjs/perfect-freehand в рендере
 * грузятся лениво, чтобы не утяжелять стартовый бандл (по образцу mermaid/markmap).
 */

import {
  type DrawData,
  type DrawStroke,
  type DrawPoint,
  type DrawFillStyle,
  type DrawStrokeStyle,
  type DrawCanvasSize,
  type DrawCamera,
  DEFAULT_DRAW_DATA,
  DEFAULT_CANVAS_SIZE,
  DEFAULT_CAMERA,
} from './drawEngineTypes'

export * from './drawEngineTypes'
export * from './drawEngineMath'
export * from './drawEngineRenderer'

// --- Идентификаторы -------------------------------------------------------

/** Стабильный id рисунка (используется в атрибуте ноды + имени ассета). */
export function generateDrawId(): string {
  // crypto.randomUUID доступен в Tauri WebView (современный WebKit) и в jsdom-тестах.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `draw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Стабильный id отдельного штриха (для выделения/манипуляций). */
export function generateStrokeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
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
    const gridType = typeof parsed.gridType === 'string' ? parsed.gridType : 'square'
    const autoDetectShapes = parsed.autoDetectShapes === true
    // canvas/camera опциональны в старых файлах — мигрируем «на лету» дефолтами.
    const canvas = normalizeCanvas(parsed.canvas)
    const camera = normalizeCamera(parsed.camera)
    return { version, strokes, bgColor, gridType, autoDetectShapes, canvas, camera }
  } catch {
    return { ...DEFAULT_DRAW_DATA }
  }
}

function isValidStroke(value: unknown): value is DrawStroke {
  if (!value || typeof value !== 'object') return false
  const s = value as Record<string, unknown>
  if (!Array.isArray(s.points) || s.points.length === 0) return false
  if (typeof s.color !== 'string' || typeof s.size !== 'number') return false
  // Текстовый штрих обязан нести непустую строку — иначе рендерить нечего.
  if (s.type === 'text' && (typeof s.text !== 'string' || s.text.length === 0)) return false
  // Image-штрих обязан иметь непустой assetSrc и минимум две точки (угол + противоположный угол).
  if (s.type === 'image') {
    if (typeof s.assetSrc !== 'string' || s.assetSrc.length === 0) return false
    if (!Array.isArray(s.points) || s.points.length < 2) return false
  }
  return Array.isArray(s.points) && s.points.every(isValidPoint)
}

function isValidPoint(value: unknown): value is DrawPoint {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return typeof p.x === 'number' && typeof p.y === 'number'
}

const VALID_FILL_STYLES: DrawFillStyle[] = ['hachure', 'solid', 'cross-hatch']
const VALID_STROKE_STYLES: DrawStrokeStyle[] = ['solid', 'dashed', 'dotted']

function normalizeStroke(stroke: DrawStroke): DrawStroke {
  const normalized: DrawStroke = {
    type: stroke.type,
    points: stroke.points.map((p) => ({ x: p.x, y: p.y, ...(typeof p.p === 'number' ? { p: p.p } : {}) })),
    color: stroke.color,
    size: stroke.size,
    ...(typeof stroke.roughness === 'number' ? { roughness: stroke.roughness } : {}),
    ...(typeof stroke.text === 'string' ? { text: stroke.text } : {}),
    ...(typeof stroke.rotation === 'number' && Number.isFinite(stroke.rotation) && stroke.rotation !== 0
      ? { rotation: stroke.rotation }
      : {}),
    // fillColor: пробрасываем, если непустая строка и не 'transparent' (иначе всё равно нет заливки).
    ...(typeof stroke.fillColor === 'string' && stroke.fillColor && stroke.fillColor !== 'transparent'
      ? { fillColor: stroke.fillColor }
      : {}),
    // fillStyle: пробрасываем, если допустимое значение и не дефолт ('hachure').
    ...(typeof stroke.fillStyle === 'string' && VALID_FILL_STYLES.includes(stroke.fillStyle as DrawFillStyle) && stroke.fillStyle !== 'hachure'
      ? { fillStyle: stroke.fillStyle as DrawFillStyle }
      : {}),
    // strokeStyle: пробрасываем, если допустимое значение и не дефолт ('solid').
    ...(typeof stroke.strokeStyle === 'string' && VALID_STROKE_STYLES.includes(stroke.strokeStyle as DrawStrokeStyle) && stroke.strokeStyle !== 'solid'
      ? { strokeStyle: stroke.strokeStyle as DrawStrokeStyle }
      : {}),
    // opacity: пробрасываем, если число в [0,1) (дефолт 1 опускаем).
    ...(typeof stroke.opacity === 'number' && Number.isFinite(stroke.opacity) && stroke.opacity >= 0 && stroke.opacity < 1
      ? { opacity: stroke.opacity }
      : {}),
    // groupId: пробрасываем непустую строку (отсутствие = не в группе).
    ...(typeof stroke.groupId === 'string' && stroke.groupId ? { groupId: stroke.groupId } : {}),
    // fontFamily: дефолт 'sans-serif' опускаем.
    ...(typeof stroke.fontFamily === 'string' && stroke.fontFamily && stroke.fontFamily !== 'sans-serif'
      ? { fontFamily: stroke.fontFamily }
      : {}),
    // fontSize: пробрасываем, только если задан и больше 0.
    ...(typeof stroke.fontSize === 'number' && Number.isFinite(stroke.fontSize) && stroke.fontSize > 0
      ? { fontSize: stroke.fontSize }
      : {}),
    // locked: пробрасываем только true (false/отсутствие = не заблокирован).
    ...(stroke.locked === true ? { locked: true } : {}),
    // startBinding/endBinding: пробрасываем только для стрелок с валидным strokeId.
    ...(stroke.type === 'arrow' && stroke.startBinding && typeof stroke.startBinding === 'object' && typeof stroke.startBinding.strokeId === 'string' && stroke.startBinding.strokeId
      ? { startBinding: { strokeId: stroke.startBinding.strokeId, ...(typeof stroke.startBinding.gap === 'number' && Number.isFinite(stroke.startBinding.gap) && stroke.startBinding.gap >= 0 ? { gap: stroke.startBinding.gap } : {}) } }
      : {}),
    ...(stroke.type === 'arrow' && stroke.endBinding && typeof stroke.endBinding === 'object' && typeof stroke.endBinding.strokeId === 'string' && stroke.endBinding.strokeId
      ? { endBinding: { strokeId: stroke.endBinding.strokeId, ...(typeof stroke.endBinding.gap === 'number' && Number.isFinite(stroke.endBinding.gap) && stroke.endBinding.gap >= 0 ? { gap: stroke.endBinding.gap } : {}) } }
      : {}),
    // arrowShape: пробрасываем только non-default значения (дефолт 'straight' не сериализуем).
    ...(stroke.type === 'arrow' && (stroke.arrowShape === 'orthogonal' || stroke.arrowShape === 'bezier')
      ? { arrowShape: stroke.arrowShape }
      : {}),
    // bend: пробрасываем только при bezier.
    ...(stroke.type === 'arrow' && stroke.arrowShape === 'bezier' && typeof stroke.bend === 'number' && Number.isFinite(stroke.bend)
      ? { bend: stroke.bend }
      : {}),
    // startCap: дефолт 'none' — пробрасываем только 'arrow'/'dot'.
    ...(stroke.type === 'arrow' && (stroke.startCap === 'arrow' || stroke.startCap === 'dot')
      ? { startCap: stroke.startCap }
      : {}),
    // endCap: дефолт 'arrow' — пробрасываем только 'dot'/'none'.
    ...(stroke.type === 'arrow' && (stroke.endCap === 'dot' || stroke.endCap === 'none')
      ? { endCap: stroke.endCap }
      : {}),
    // assetSrc: пробрасываем непустую строку (только для image).
    ...(typeof stroke.assetSrc === 'string' && stroke.assetSrc ? { assetSrc: stroke.assetSrc } : {}),
    // naturalWidth/naturalHeight: пробрасываем положительные конечные числа.
    ...(typeof stroke.naturalWidth === 'number' && Number.isFinite(stroke.naturalWidth) && stroke.naturalWidth > 0
      ? { naturalWidth: stroke.naturalWidth }
      : {}),
    ...(typeof stroke.naturalHeight === 'number' && Number.isFinite(stroke.naturalHeight) && stroke.naturalHeight > 0
      ? { naturalHeight: stroke.naturalHeight }
      : {}),
  }
  // Стабильный seed: либо сохранённый, либо детерминированный хэш контента.
  // Без этого roughjs на каждом рендере выдаёт разное «дрожание» hand-drawn.
  normalized.seed = typeof stroke.seed === 'number' && Number.isFinite(stroke.seed)
    ? Math.floor(stroke.seed)
    : hashStroke(normalized)
  // Стабильный id: сохранённый или новый (для старых рисунков без id).
  normalized.id = typeof stroke.id === 'string' && stroke.id ? stroke.id : generateStrokeId()
  return normalized
}

function normalizeCanvas(value: unknown): DrawCanvasSize {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CANVAS_SIZE }
  const c = value as Partial<DrawCanvasSize>
  const width = typeof c.width === 'number' && Number.isFinite(c.width) && c.width > 0 ? c.width : DEFAULT_CANVAS_SIZE.width
  const height = typeof c.height === 'number' && Number.isFinite(c.height) && c.height > 0 ? c.height : DEFAULT_CANVAS_SIZE.height
  return { width, height }
}

function normalizeCamera(value: unknown): DrawCamera {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CAMERA }
  const c = value as Partial<DrawCamera>
  const x = typeof c.x === 'number' && Number.isFinite(c.x) ? c.x : 0
  const y = typeof c.y === 'number' && Number.isFinite(c.y) ? c.y : 0
  const scale = typeof c.scale === 'number' && Number.isFinite(c.scale) && c.scale > 0 ? c.scale : 1
  return { x, y, scale }
}

/** Детерминированный 31-битный хэш контента штриха → seed для roughjs.
 *  Одинаковый штрих всегда даёт одинаковый seed, поэтому фигура стабильна
 *  между рендерами, даже если она пришла из старого файла без явного seed. */
function hashStroke(stroke: DrawStroke): number {
  let h = 0x811c9dc5
  const feed = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
  }
  feed(stroke.type)
  feed(stroke.color)
  feed(`:${stroke.size}:`)
  feed(typeof stroke.roughness === 'number' ? `${stroke.roughness}:` : ':')
  feed(typeof stroke.text === 'string' ? `t=${stroke.text};` : '')
  feed(typeof stroke.rotation === 'number' ? `r=${Math.round(stroke.rotation * 1000)};` : '')
  feed(stroke.fillColor ?? '')
  feed(stroke.fillStyle ?? '')
  feed(stroke.strokeStyle ?? '')
  feed(stroke.assetSrc ?? '')
  feed(stroke.arrowShape ?? '')
  feed(stroke.startCap ?? '')
  feed(stroke.endCap ?? '')
  feed(typeof stroke.bend === 'number' ? `b=${Math.round(stroke.bend)};` : '')
  feed(typeof stroke.opacity === 'number' ? `o=${stroke.opacity};` : '')
  feed(stroke.fontFamily ?? '')
  feed(typeof stroke.fontSize === 'number' ? `fs=${stroke.fontSize};` : '')
  for (const p of stroke.points) feed(`${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${typeof p.p === 'number' ? p.p : ''};`)
  // 31-битный неотрицательный инт.
  return (h >>> 0) % 0x80000000
}
