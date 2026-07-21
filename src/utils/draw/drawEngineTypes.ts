/**
 * drawEngineTypes — объявление типов данных штрихов, холста и камеры для
 * блока `draw_block`, а также связанных констант-дефолтов и простых
 * type-предикатов. Не содержит DOM/рендер-логики — только модель данных.
 *
 * Формат данных стабилен и версионирован — см. `DrawData.version`.
 */

export type DrawTool = 'freehand' | 'highlighter' | 'rectangle' | 'line' | 'arrow' | 'ellipse' | 'diamond' | 'text'
export type DrawArrowShape = 'straight' | 'orthogonal' | 'bezier'
/** Тип «конца» (наконечника) стрелки с каждой стороны.
 *  Дефолты: начало (`startCap`) — `'none'`, конец (`endCap`) — `'arrow'`. */
export type DrawArrowCap = 'arrow' | 'dot' | 'none'

/** Тип штриха: все рисующие инструменты + встраиваемое изображение-ассет. */
export type DrawStrokeType = DrawTool | 'image'

/** Типы штрихов, рисуемые «от руки» (perfect-freehand): карандаш и маркер.
 *  Накапливают каждую точку ввода и не считаются вырожденными при клике. */
export function isFreehandType(type: DrawStrokeType): boolean {
  return type === 'freehand' || type === 'highlighter'
}

/** Возвращает true для типов штрихов, к которым можно привязать конец стрелки.
 *  Только замкнутые фигуры и изображения — они имеют чётко определённые границы. */
export function isBindableType(type: DrawStrokeType): boolean {
  return type === 'rectangle' || type === 'ellipse' || type === 'diamond' || type === 'image' || type === 'text'
}

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

/** Прямоугольник (минимумы/максимумы по осям). */
export interface DrawRect {
  minX: number
  minY: number
  maxX: number
  maxY: number
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

export const FONT_MAP: Record<string, string> = {
  'sans-serif': "'Geist Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  'serif': "'Instrument Serif', 'Cambria', Georgia, serif",
  'monospace': "'Geist Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
}
