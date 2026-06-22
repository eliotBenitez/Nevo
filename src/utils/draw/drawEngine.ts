/**
 * drawEngine — чистый (DOM/события-агностик) движок рисования для блока
 * `draw_block`. Точки/штрихи хранятся как компактный JSON-массив и
 * рендерятся в SVG через roughjs (hand-drawn геометрия) и perfect-freehand
 * (pressure-sensitive штрихи). Библиотеки грузятся лениво, чтобы не
 * утяжелять стартовый бандл (по образцу mermaid/markmap).
 *
 * Формат данных стабилен и версионирован — см. `DrawData.version`.
 */

export type DrawTool = 'freehand' | 'highlighter' | 'rectangle' | 'line' | 'arrow' | 'ellipse' | 'diamond' | 'text'
export type DrawArrowShape = 'straight' | 'orthogonal' | 'bezier'
/** Тип «конца» (наконечника) стрелки с каждой стороны.
 *  Дефолты: начало (`startCap`) — `'none'`, конец (`endCap`) — `'arrow'`. */
export type DrawArrowCap = 'arrow' | 'dot' | 'none'

/** Типы штрихов, рисуемые «от руки» (perfect-freehand): карандаш и маркер.
 *  Накапливают каждую точку ввода и не считаются вырожденными при клике. */
export function isFreehandType(type: DrawStrokeType): boolean {
  return type === 'freehand' || type === 'highlighter'
}

/** Тип штриха: все рисующие инструменты + встраиваемое изображение-ассет. */
export type DrawStrokeType = DrawTool | 'image'

/** Стиль заливки замкнутых фигур (roughjs fillStyle). */
export type DrawFillStyle = 'hachure' | 'solid' | 'cross-hatch'
/** Стиль линии контура штриха. */
export type DrawStrokeStyle = 'solid' | 'dashed' | 'dotted'

/** Одна точка ввода (pointer event). `p` — давление, 0..1 (опц.). */
export interface DrawPoint {
  x: number
  y: number
  /** Pressure 0..1, опционально (мышь → 0.5 по умолчанию). */
  p?: number
}

/** Привязка конца стрелки к другому штриху-якорю.
 *  Применимо только к `type === 'arrow'`. */
export interface DrawBinding {
  /** id штриха-якоря, к которому привязан конец стрелки. */
  strokeId: string
  /** Зазор между концом стрелки и краем фигуры (world-единицы). Дефолт ~4. */
  gap?: number
}

/** Один штрих фигуры. Для геометрии `points` = опорные точки (2+). */
export interface DrawStroke {
  type: DrawStrokeType
  points: DrawPoint[]
  color: string
  size: number
  /** Hand-drawn «шероховатость» roughjs, 0..5 (только для геометрии). */
  roughness?: number
  /** Стабильный seed roughjs, чтобы фигура не «шевелилась» при перерисовке.
   *  Опционально: при отсутствии seed выводится детерминированно из контента
   *  штриха (см. `hashStroke`) — поэтому старые рисунки тоже рендерятся стабильно. */
  seed?: number
  /** Текст (только для `type === 'text'`). `points[0]` — левый-верхний угол.
   *  Размер шрифта = `size * TEXT_FONT_SCALE` в координатах холста. */
  text?: string
  /** Стабильный id штриха. Нужен для выделения/манипуляций, т.к. массив
   *  штрихов пересоздаётся иммутабельно (индексы и ссылки нестабильны).
   *  Назначается при создании; при загрузке старых рисунков — в normalizeStroke. */
  id?: string
  /** Поворот штриха вокруг центра его (неповёрнутого) bbox, в радианах.
   *  Применяется на рендере (<g transform="rotate(...)">), а `points` остаются
   *  осенаправленными — поэтому форма не искажается при повторных поворотах. */
  rotation?: number
  /** Цвет заливки замкнутых фигур (rectangle/ellipse/diamond).
   *  Отсутствие или `'transparent'` — без заливки. */
  fillColor?: string
  /** Стиль заливки roughjs. Дефолт `'hachure'` (штриховка). */
  fillStyle?: DrawFillStyle
  /** Стиль линии контура. Дефолт `'solid'`. */
  strokeStyle?: DrawStrokeStyle
  /** Прозрачность штриха, 0..1. Дефолт 1 (непрозрачный). */
  opacity?: number
  /** Id группы. Штрихи с одинаковым groupId выделяются и трансформируются вместе.
   *  Отсутствие означает, что штрих не принадлежит ни одной группе. */
  groupId?: string
  /** Заблокированный штрих нельзя двигать, ресайзить или удалять через UI.
   *  `true` — заблокирован; отсутствие поля или `false` — не заблокирован. */
  locked?: boolean
  fontFamily?: string
  fontSize?: number
  /** Привязка начала стрелки (points[0]) к другому штриху. */
  startBinding?: DrawBinding
  /** Привязка конца стрелки (points[1]) к другому штриху.
   *  Применимо только к `type === 'arrow'`. */
  endBinding?: DrawBinding
  /** Форма стрелки-коннектора. Дефолт 'straight' (прямая). Только для type==='arrow'. */
  arrowShape?: DrawArrowShape
  /** Знаковый перпендикулярный отступ апекса кривой от хорды (world-единицы).
   *  Только для arrowShape==='bezier'. Управляется drag-ручкой изгиба. */
  bend?: number
  /** Наконечник у начала стрелки (points[0]). Дефолт `'none'`. Только для arrow. */
  startCap?: DrawArrowCap
  /** Наконечник у конца стрелки (points[1]). Дефолт `'arrow'`. Только для arrow. */
  endCap?: DrawArrowCap
  /** Путь ассета (`.nevo/assets/...`) только для `type === 'image'`.
   *  `points[0]` — левый-верхний угол, `points[1]` — правый-нижний (как rectangle). */
  assetSrc?: string
  /** Натуральная ширина исходника в пикселях (для соблюдения аспекта при создании). */
  naturalWidth?: number
  /** Натуральная высота исходника в пикселях (для соблюдения аспекта при создании). */
  naturalHeight?: number
}

/** Логический размер холста (координатное пространство рисунка). */
export interface DrawCanvasSize {
  width: number
  height: number
}

/** Камера: сдвиг и масштаб видимой области в логических координатах холста. */
export interface DrawCamera {
  x: number
  y: number
  scale: number
}

export interface DrawData {
  /** Версия формата. Бампится при несовместимых изменениях схемы. */
  version: 1
  strokes: DrawStroke[]
  /** Фон холста (CSS-цвет). По умолчанию прозрачный. */
  bgColor: string
  /** Тип сетки: none | square | lines | dots */
  gridType?: string
  /** Авто-распознавание нарисованных от руки фигур */
  autoDetectShapes?: boolean
  /** Логическое координатное пространство рисунка. Одно и то же используется
   *  и в холсте рисования, и в preview — поэтому фигуры не дрейфуют при
   *  добавлении новых штрихов (раньше viewBox preview пересчитывался по bbox). */
  canvas: DrawCanvasSize
  /** Текущий вид (pan/zoom) бесконечного холста — сохраняется между сессиями. */
  camera: DrawCamera
}

export const DEFAULT_CANVAS_SIZE: DrawCanvasSize = { width: 1600, height: 1000 }
export const DEFAULT_CAMERA: DrawCamera = { x: 0, y: 0, scale: 1 }

export const DEFAULT_DRAW_DATA: DrawData = {
  version: 1,
  strokes: [],
  bgColor: 'transparent',
  gridType: 'square',
  autoDetectShapes: false,
  canvas: { ...DEFAULT_CANVAS_SIZE },
  camera: { ...DEFAULT_CAMERA },
}

/** Цвет по умолчанию для новых штрихов (тёмный «чернильный»). */
export const DEFAULT_STROKE_COLOR = '#1e1e1e'
export const DEFAULT_STROKE_SIZE = 3
export const DEFAULT_ROUGHNESS = 1.5

/** Множитель ширины маркера относительно `size` (маркер — широкая кисть). */
export const HIGHLIGHTER_SIZE_SCALE = 7
/** Базовая полупрозрачность штриха маркера (запекается в fill-opacity). */
export const HIGHLIGHTER_OPACITY = 0.4

/** Множитель: размер шрифта текста = `stroke.size * TEXT_FONT_SCALE`. Позволяет
 *  переиспользовать общий селектор размера (2/4/8/14 → 12/24/48/84px). */
export const TEXT_FONT_SCALE = 6
/** Шрифт текстовых блоков. Один и тот же в SVG-рендере и в оверлее-редакторе,
 *  чтобы превью совпадало с тем, что пользователь печатал. */
export const DRAW_TEXT_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
/** Межстрочный интервал (line-height) текстовых блоков. */
export const TEXT_LINE_HEIGHT = 1.2

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

// --- Рендеринг в SVG ------------------------------------------------------

export const FONT_MAP: Record<string, string> = {
  'sans-serif': "Geist, -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  'serif': "'Instrument Serif', 'Cambria', Georgia, serif",
  'monospace': "'Geist Mono', 'JetBrains Mono', ui-monospace, monospace",
}

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

/** Возвращает true для типов штрихов, к которым можно привязать конец стрелки.
 *  Только замкнутые фигуры и изображения — они имеют чётко определённые границы. */
export function isBindableType(type: DrawStrokeType): boolean {
  return type === 'rectangle' || type === 'ellipse' || type === 'diamond' || type === 'image' || type === 'text'
}

/** Вычисляет точку пересечения луча из центра bbox фигуры в направлении `toward`
 *  с границей bbox, расширенного на `gap`. Иммутабельно — фигура не мутируется.
 *
 *  Используется для привязки конца стрелки: конец ставится на поверхность фигуры
 *  с заданным зазором, а не в центр. */
export function arrowEndpointOnShape(shape: DrawStroke, toward: DrawPoint, gap = 4): DrawPoint {
  const raw = strokeBBox(shape)
  let minX = raw.minX - gap
  let minY = raw.minY - gap
  let maxX = raw.maxX + gap
  let maxY = raw.maxY + gap
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

/** Прямоугольник (минимумы/максимумы по осям). */
export interface DrawRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
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

const SVG_NS = 'http://www.w3.org/2000/svg'

/** Опции рендеринга штрихов в SVG. */
export interface DrawRenderOptions {
  /** Резолвер href для image-штрихов. Получает штрих и возвращает data-URI или
   *  абсолютный URL для атрибута `href` элемента `<image>`. При `undefined`
   *  рендерится плейсхолдер (серый прямоугольник со штриховой рамкой). */
  resolveImageHref?: (stroke: DrawStroke) => string | undefined
}

/**
 * Рендерит массив штрихов в строку SVG-разметки (без <svg>-обёртки).
 * Возвращает содержимое для вставки внутрь <svg>. Используется и в
 * node-view (preview), и в экспорте. roughjs/perfect-freehand грузятся
 * лениво (dynamic import).
 */
export async function renderStrokesToSvgInner(strokes: DrawStroke[], opts?: DrawRenderOptions): Promise<string> {
  if (strokes.length === 0) return ''
  const [{ RoughSVG }, { default: getStroke }] = await Promise.all([
    import('roughjs/bin/svg'),
    import('perfect-freehand'),
  ])

  const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  // roughjs v4: RoughSVG конструируется от SVG-элемента.
  const rc = new RoughSVG(svgEl)

  // Маркер всегда рисуется ПОД остальными штрихами, независимо от порядка
  // создания/z-order. Сначала выводим все highlighter-штрихи (сохраняя их
  // относительный порядок), затем — все прочие.
  const ordered = strokes.some((s) => s.type === 'highlighter')
    ? [...strokes.filter((s) => s.type === 'highlighter'), ...strokes.filter((s) => s.type !== 'highlighter')]
    : strokes

  const fragments: string[] = []
  for (const stroke of ordered) {
    const nodes = strokeToSvgNodes(stroke, rc, getStroke, opts)
    if (!nodes.length) continue
    const inner = nodes.map(serialiseXmlNode).join('')
    // Собираем атрибуты обёртки <g>: поворот и/или прозрачность.
    const attrs: string[] = []
    if (stroke.rotation) {
      const c = strokeCenter(stroke)
      const deg = (stroke.rotation * 180) / Math.PI
      attrs.push(`transform="rotate(${deg} ${c.x} ${c.y})"`)
    }
    if (typeof stroke.opacity === 'number' && stroke.opacity < 1) {
      attrs.push(`opacity="${String(stroke.opacity)}"`)
    }
    if (attrs.length > 0) {
      fragments.push(`<g ${attrs.join(' ')}>${inner}</g>`)
    } else {
      fragments.push(inner)
    }
  }
  return fragments.join('')
}

function strokeToSvgNodes(
  stroke: DrawStroke,
  rc: import('roughjs/bin/svg').RoughSVG,
  getStroke: typeof import('perfect-freehand')['default'],
  opts?: DrawRenderOptions,
): SVGGElement[] {
  // --- Image-штрих: рендерим <image> (если href резолвится) или плейсхолдер ---
  if (stroke.type === 'image') {
    if (stroke.points.length < 2) return []
    const b = rectFromTwoPoints(stroke.points[0], stroke.points[1])
    const href = opts?.resolveImageHref?.(stroke)
    if (href) {
      const img = document.createElementNS(SVG_NS, 'image')
      img.setAttribute('x', String(b.x))
      img.setAttribute('y', String(b.y))
      img.setAttribute('width', String(b.w))
      img.setAttribute('height', String(b.h))
      img.setAttribute('href', href)
      img.setAttribute('preserveAspectRatio', 'none')
      return [img as unknown as SVGGElement]
    }
    // Плейсхолдер — пока href не резолвится (картинка грузится / ассет пропал).
    const rect = document.createElementNS(SVG_NS, 'rect')
    rect.setAttribute('x', String(b.x))
    rect.setAttribute('y', String(b.y))
    rect.setAttribute('width', String(b.w))
    rect.setAttribute('height', String(b.h))
    rect.setAttribute('fill', 'rgba(0,0,0,0.04)')
    rect.setAttribute('stroke', 'rgba(0,0,0,0.25)')
    rect.setAttribute('stroke-dasharray', '6 4')
    return [rect as unknown as SVGGElement]
  }

  // Замкнутые фигуры (rectangle/ellipse/diamond) поддерживают заливку.
  const isClosedShape = stroke.type === 'rectangle' || stroke.type === 'ellipse' || stroke.type === 'diamond'
  const fillValue = isClosedShape && stroke.fillColor && stroke.fillColor !== 'transparent'
    ? stroke.fillColor
    : 'none'

  const roughOpts: import('roughjs/bin/core').Options = {
    stroke: stroke.color,
    strokeWidth: stroke.size,
    roughness: typeof stroke.roughness === 'number' ? stroke.roughness : DEFAULT_ROUGHNESS,
    fill: fillValue,
    fillStyle: stroke.fillStyle ?? 'hachure',
    // Стабильный seed → hand-drawn «дрожание» не меняется между рендерами.
    seed: stroke.seed,
  }

  // Пунктир и точки — для геометрии и стрелки (не freehand/text).
  if (stroke.strokeStyle === 'dashed') {
    roughOpts.strokeLineDash = [stroke.size * 4, stroke.size * 2]
  } else if (stroke.strokeStyle === 'dotted') {
    roughOpts.strokeLineDash = [stroke.size, stroke.size * 1.6]
  }

  if (stroke.type === 'text') {
    const node = textToSvgNode(stroke)
    return node ? [node] : []
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

  if (stroke.type === 'highlighter') {
    // Маркер: широкая кисть равномерной толщины (без давления) и полупрозрачная.
    const strokePoints = getStroke(
      stroke.points.map((p) => [p.x, p.y, 0.5]),
      { size: stroke.size * HIGHLIGHTER_SIZE_SCALE, thinning: 0, smoothing: 0.5, streamline: 0.5 },
    )
    const d = svgPathFromPoints(strokePoints)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', stroke.color)
    path.setAttribute('fill-opacity', String(HIGHLIGHTER_OPACITY))
    path.setAttribute('stroke', 'none')
    return [path as unknown as SVGGElement]
  }

  const pts = stroke.points
  if (pts.length < 2) return []

  if (stroke.type === 'line') {
    return [rc.line(pts[0].x, pts[0].y, pts[1].x, pts[1].y, roughOpts)]
  }
  if (stroke.type === 'rectangle') {
    const { x, y, w, h } = rectFromTwoPoints(pts[0], pts[1])
    return [rc.rectangle(x, y, w, h, roughOpts)]
  }
  if (stroke.type === 'ellipse') {
    const { x, y, w, h } = rectFromTwoPoints(pts[0], pts[1])
    return [rc.ellipse(x + w / 2, y + h / 2, w, h, roughOpts)]
  }
  if (stroke.type === 'diamond') {
    const { x, y, w, h } = rectFromTwoPoints(pts[0], pts[1])
    const points: [number, number][] = [
      [x + w / 2, y],
      [x + w, y + h / 2],
      [x + w / 2, y + h],
      [x, y + h / 2],
    ]
    return [rc.polygon(points, roughOpts)]
  }
  if (stroke.type === 'arrow') {
    return drawArrow(rc, pts[0], pts[1], roughOpts, stroke.arrowShape ?? 'straight', stroke.bend, stroke.startCap ?? 'none', stroke.endCap ?? 'arrow')
  }
  return []
}

/** Строит нативный SVG `<text>` для текстового штриха. Точка `points[0]` —
 *  левый-верхний угол (baseline="hanging"), многострочность — через `<tspan>`.
 *  Текст — нативный SVG (не foreignObject), поэтому корректно растрируется в
 *  экспорте даже на WebKitGTK. */
function textToSvgNode(stroke: DrawStroke): SVGGElement | null {
  const content = stroke.text ?? ''
  if (!content) return null
  const p = stroke.points[0]
  if (!p) return null
  const fontSize = textFontSize(stroke)
  const text = document.createElementNS(SVG_NS, 'text')
  text.setAttribute('x', String(p.x))
  text.setAttribute('y', String(p.y))
  text.setAttribute('fill', stroke.color)
  text.setAttribute('font-size', String(fontSize))
  const fontFamilyValue = stroke.fontFamily && FONT_MAP[stroke.fontFamily]
    ? FONT_MAP[stroke.fontFamily]
    : DRAW_TEXT_FONT
  text.setAttribute('font-family', fontFamilyValue)
  text.setAttribute('dominant-baseline', 'hanging')
  text.setAttribute('xml:space', 'preserve')
  const lines = content.split('\n')
  lines.forEach((line, i) => {
    const tspan = document.createElementNS(SVG_NS, 'tspan')
    tspan.setAttribute('x', String(p.x))
    tspan.setAttribute('dominant-baseline', 'hanging')
    if (i > 0) {
      tspan.setAttribute('dy', String(fontSize * TEXT_LINE_HEIGHT))
    }
    // Пустую строку рендерим как пробел, иначе <tspan> схлопывается и сбивает dy.
    tspan.textContent = line.length ? line : ' '
    text.appendChild(tspan)
  })
  return text as unknown as SVGGElement
}

function rectFromTwoPoints(a: DrawPoint, b: DrawPoint): { x: number; y: number; w: number; h: number } {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const w = Math.abs(b.x - a.x)
  const h = Math.abs(b.y - a.y)
  return { x, y, w: Math.max(w, 1), h: Math.max(h, 1) }
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

/** Рисует наконечник стрелки в точке `at`, «открытый» в сторону угла `angle`
 *  (угол наружу от линии). Две линии-уса под ±headAngle. */
function appendArrowHead(
  nodes: SVGGElement[],
  rc: import('roughjs/bin/svg').RoughSVG,
  at: DrawPoint,
  angle: number,
  opts: import('roughjs/bin/core').Options,
): void {
  const headLen = Math.max(12, opts.strokeWidth ? opts.strokeWidth * 4 : 12)
  const headAngle = Math.PI / 7
  const a1 = angle - headAngle
  const a2 = angle + headAngle
  nodes.push(rc.line(at.x, at.y, at.x - headLen * Math.cos(a1), at.y - headLen * Math.sin(a1), opts))
  nodes.push(rc.line(at.x, at.y, at.x - headLen * Math.cos(a2), at.y - headLen * Math.sin(a2), opts))
}

/** Рисует «точку» (залитый кружок цветом обводки) в конце стрелки. */
function appendArrowDot(
  nodes: SVGGElement[],
  rc: import('roughjs/bin/svg').RoughSVG,
  at: DrawPoint,
  opts: import('roughjs/bin/core').Options,
): void {
  const d = Math.max(8, (opts.strokeWidth ?? 2) * 3)
  nodes.push(rc.circle(at.x, at.y, d, { ...opts, fill: opts.stroke, fillStyle: 'solid', strokeLineDash: undefined }))
}

/** Наконечник заданного типа в точке `at`, ориентированный наружу под `angle`. */
function appendCap(
  nodes: SVGGElement[],
  rc: import('roughjs/bin/svg').RoughSVG,
  cap: DrawArrowCap,
  at: DrawPoint,
  angle: number,
  opts: import('roughjs/bin/core').Options,
): void {
  if (cap === 'arrow') appendArrowHead(nodes, rc, at, angle, opts)
  else if (cap === 'dot') appendArrowDot(nodes, rc, at, opts)
  // 'none' — ничего.
}

function drawArrow(
  rc: import('roughjs/bin/svg').RoughSVG,
  from: DrawPoint,
  to: DrawPoint,
  opts: import('roughjs/bin/core').Options,
  shape: DrawArrowShape = 'straight',
  bend?: number,
  startCap: DrawArrowCap = 'none',
  endCap: DrawArrowCap = 'arrow',
): SVGGElement[] {
  const geom = buildArrowGeometry(from, to, shape, bend)

  let nodes: SVGGElement[]
  if (geom.shape === 'bezier' && geom.control) {
    nodes = [rc.path(`M ${from.x} ${from.y} Q ${geom.control.x} ${geom.control.y} ${to.x} ${to.y}`, opts)]
  } else {
    nodes = [rc.linearPath(geom.points.map((p) => [p.x, p.y] as [number, number]), opts)]
  }

  // Конец (points[1]): угол наружу = tangent → tip.
  const endAngle = Math.atan2(geom.tip.y - geom.tangent.y, geom.tip.x - geom.tangent.x)
  appendCap(nodes, rc, endCap, geom.tip, endAngle, opts)

  // Начало (points[0]): угол наружу = (второй узел тела) → from.
  const secondPt = geom.points[1] ?? geom.tip
  const startAngle = Math.atan2(from.y - secondPt.y, from.x - secondPt.x)
  appendCap(nodes, rc, startCap, { x: from.x, y: from.y }, startAngle, opts)

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
 *
 * Для бесконечного холста viewBox вычисляется как fit по bbox всех штрихов
 * (с отступом `padding`) — preview показывает именно нарисованное содержимое,
 * где бы оно ни находилось в world-координатах. Стабильность формы каждой
 * фигуры обеспечивает детерминированный `seed` roughjs (см. `hashStroke`):
 * одна и та же фигура всегда рендерится одинаково, даже когда bbox меняется
 * от добавления других фигур (масштаб всего preview при этом, естественно,
 * пересчитывается — это ожидаемое поведение fit, как в Excalidraw/tldraw).
 *
 * Фон «бумаги»: холст рисования всегда светлый (как лист бумаги), поэтому и
 * preview по умолчанию (transparent bgColor) рисуется на белом фоне — иначе
 * тёмные чернила висят «в пустоте» и сливаются с тёмной темой. Явный
 * непрозрачный bgColor пользователя имеет приоритет.
 */
export async function renderDrawToSvgString(data: DrawData, padding = 24, opts?: DrawRenderOptions): Promise<string> {
  const inner = await renderStrokesToSvgInner(data.strokes, opts)
  // Пустой рисунок — показываем дефолтный canvas, чтобы preview имел размер.
  const { minX, minY, maxX, maxY } = computeBounds(data.strokes)
  const hasContent = data.strokes.length > 0 && (maxX > minX || maxY > minY)
  // Цвет бумаги: явный bgColor, иначе белый (как сам холст рисования).
  const paper = data.bgColor && data.bgColor !== 'transparent' ? data.bgColor : '#ffffff'
  let viewBox: string
  let bgRect: string
  if (hasContent) {
    const width = Math.max(maxX - minX, 1) + padding * 2
    const height = Math.max(maxY - minY, 1) + padding * 2
    const ox = minX - padding
    const oy = minY - padding
    viewBox = `${ox} ${oy} ${width} ${height}`
    bgRect = `<rect x="${ox}" y="${oy}" width="${width}" height="${height}" fill="${paper}"/>`
  } else {
    const canvas = data.canvas ?? DEFAULT_CANVAS_SIZE
    const width = Math.max(canvas.width, 1)
    const height = Math.max(canvas.height, 1)
    viewBox = `0 0 ${width} ${height}`
    bgRect = `<rect x="0" y="0" width="${width}" height="${height}" fill="${paper}"/>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" preserveAspectRatio="xMidYMid meet" class="nv-draw-preview">${bgRect}${inner}</svg>`
}
