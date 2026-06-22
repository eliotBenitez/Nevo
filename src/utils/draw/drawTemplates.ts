/**
 * drawTemplates — статическая библиотека быстрых UI/диаграмм-шаблонов для
 * холста `draw_block`. Каждый шаблон — это фабрика, возвращающая массив
 * примитивов `DrawStroke[]` в ЛОКАЛЬНЫХ координатах (около начала координат).
 *
 * Штрихи возвращаются БЕЗ `id`/`groupId`/`seed` — они присваиваются при вставке
 * (`insertTemplate` в useDrawStrokeInput): новые уникальные id, единый groupId
 * (чтобы шаблон вёл себя как единое целое) и центрирование во вьюпорте.
 *
 * Чистый модуль (без Vue/DOM) — легко тестируется и переиспользуется для
 * рендера превью через `renderDrawToSvgString`.
 */

import { TEXT_FONT_SCALE, TEXT_LINE_HEIGHT, type DrawStroke } from './drawEngine'

/** Категория шаблона (для группировки во вкладке библиотеки). */
export type DrawTemplateCategory = 'ui' | 'diagram'

export interface DrawTemplate {
  /** Стабильный ключ шаблона (для i18n-подписи и previews-кэша). */
  id: string
  category: DrawTemplateCategory
  /** Фабрика штрихов в локальных координатах. Каждый вызов — новый массив. */
  build(): DrawStroke[]
}

// --- Палитра шаблонов (чистый «вайрфрейм»: тонкая обводка, без «дрожания») ---
const INK = '#1e1e1e'
const MUTED = '#868e96'
const PANEL = '#ededed'
const FIELD = '#ffffff'
const STICKY = '#ffec99'

// --- Низкоуровневые билдеры примитивов ------------------------------------

function rect(x: number, y: number, w: number, h: number, extra: Partial<DrawStroke> = {}): DrawStroke {
  return { type: 'rectangle', points: [{ x, y }, { x: x + w, y: y + h }], color: INK, size: 2, roughness: 0, ...extra }
}

function ellipse(x: number, y: number, w: number, h: number, extra: Partial<DrawStroke> = {}): DrawStroke {
  return { type: 'ellipse', points: [{ x, y }, { x: x + w, y: y + h }], color: INK, size: 2, roughness: 0, ...extra }
}

function diamond(x: number, y: number, w: number, h: number, extra: Partial<DrawStroke> = {}): DrawStroke {
  return { type: 'diamond', points: [{ x, y }, { x: x + w, y: y + h }], color: INK, size: 2, roughness: 0, ...extra }
}

function line(x1: number, y1: number, x2: number, y2: number, extra: Partial<DrawStroke> = {}): DrawStroke {
  return { type: 'line', points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], color: INK, size: 2, roughness: 0, ...extra }
}

function arrow(x1: number, y1: number, x2: number, y2: number, extra: Partial<DrawStroke> = {}): DrawStroke {
  return { type: 'arrow', points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], color: INK, size: 2, roughness: 0, ...extra }
}

function text(content: string, x: number, y: number, size = 3, color = INK): DrawStroke {
  return { type: 'text', points: [{ x, y }], text: content, color, size, roughness: 0 }
}

/** Текст, приблизительно центрированный внутри бокса (по тем же метрикам,
 *  что использует strokeBBox: ширина ≈ chars·font·0.6, высота ≈ lines·font·1.2). */
function centeredText(content: string, bx: number, by: number, bw: number, bh: number, size = 3, color = INK): DrawStroke {
  const fontSize = size * TEXT_FONT_SCALE
  const lines = content.split('\n')
  const w = Math.max(1, ...lines.map((l) => l.length)) * fontSize * 0.6
  const h = Math.max(1, lines.length) * fontSize * TEXT_LINE_HEIGHT
  return text(content, bx + (bw - w) / 2, by + (bh - h) / 2, size, color)
}

/** Текст, выровненный по левому краю и вертикально центрированный в боксе. */
function leftText(content: string, bx: number, by: number, bh: number, pad = 12, size = 2.5, color = INK): DrawStroke {
  const fontSize = size * TEXT_FONT_SCALE
  const h = fontSize * TEXT_LINE_HEIGHT
  return text(content, bx + pad, by + (bh - h) / 2, size, color)
}

// --- Коллекция шаблонов ----------------------------------------------------

export const DRAW_TEMPLATES: DrawTemplate[] = [
  // ----- UI-элементы -----
  {
    id: 'button',
    category: 'ui',
    build: () => [
      rect(0, 0, 140, 44, { fillColor: PANEL, fillStyle: 'solid' }),
      centeredText('Button', 0, 0, 140, 44, 3),
    ],
  },
  {
    id: 'input',
    category: 'ui',
    build: () => [
      rect(0, 0, 220, 40, { fillColor: FIELD, fillStyle: 'solid' }),
      leftText('Text…', 0, 0, 40, 12, 2.5, MUTED),
    ],
  },
  {
    id: 'checkbox',
    category: 'ui',
    build: () => [
      rect(0, 3, 18, 18),
      text('Label', 28, 4, 2.5),
    ],
  },
  {
    id: 'card',
    category: 'ui',
    build: () => [
      rect(0, 0, 220, 150),
      text('Title', 16, 16, 3),
      line(16, 60, 204, 60, { color: MUTED, size: 1 }),
      line(16, 82, 204, 82, { color: MUTED, size: 1 }),
      line(16, 104, 160, 104, { color: MUTED, size: 1 }),
    ],
  },
  {
    id: 'browser',
    category: 'ui',
    build: () => [
      rect(0, 0, 340, 240),
      rect(0, 0, 340, 34, { fillColor: PANEL, fillStyle: 'solid' }),
      ellipse(12, 12, 10, 10, { color: '#e03131', size: 1 }),
      ellipse(28, 12, 10, 10, { color: '#f08c00', size: 1 }),
      ellipse(44, 12, 10, 10, { color: '#2f9e44', size: 1 }),
      rect(66, 8, 200, 18, { fillColor: FIELD, fillStyle: 'solid', size: 1 }),
    ],
  },
  {
    id: 'phone',
    category: 'ui',
    build: () => [
      rect(0, 0, 170, 320),
      rect(10, 34, 150, 252, { fillColor: FIELD, fillStyle: 'solid' }),
      line(64, 18, 106, 18, { size: 3 }),
      ellipse(77, 294, 16, 16, { size: 1 }),
    ],
  },
  // ----- Блок-схемы / диаграммы -----
  {
    id: 'process',
    category: 'diagram',
    build: () => [
      rect(0, 0, 170, 72),
      centeredText('Process', 0, 0, 170, 72, 3),
    ],
  },
  {
    id: 'decision',
    category: 'diagram',
    build: () => [
      diamond(0, 0, 180, 110),
      centeredText('Decision', 0, 0, 180, 110, 3),
    ],
  },
  {
    id: 'terminator',
    category: 'diagram',
    build: () => [
      ellipse(0, 0, 150, 64),
      centeredText('Start', 0, 0, 150, 64, 3),
    ],
  },
  {
    id: 'connector',
    category: 'diagram',
    build: () => [
      arrow(0, 0, 140, 0),
    ],
  },
  {
    id: 'sticky',
    category: 'diagram',
    build: () => [
      rect(0, 0, 150, 150, { fillColor: STICKY, fillStyle: 'solid' }),
      text('Note', 16, 16, 3),
    ],
  },
  {
    id: 'person',
    category: 'diagram',
    build: () => [
      ellipse(16, 0, 28, 28),       // голова
      line(30, 28, 30, 80),         // туловище
      line(8, 46, 52, 46),          // руки
      line(30, 80, 12, 118),        // левая нога
      line(30, 80, 48, 118),        // правая нога
    ],
  },
]
