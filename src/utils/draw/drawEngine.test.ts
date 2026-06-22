import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DRAW_DATA,
  DEFAULT_CANVAS_SIZE,
  DEFAULT_CAMERA,
  computeBounds,
  generateDrawId,
  parseDrawData,
  serializeDrawData,
  svgPathFromPoints,
  renderDrawToSvgString,
  renderStrokesToSvgInner,
  strokeBBox,
  textFontSize,
  rectsIntersect,
  translateStroke,
  reflectStroke,
  isBindableType,
  isFreehandType,
  arrowEndpointOnShape,
  reflowBoundArrows,
  buildArrowGeometry,
  HIGHLIGHTER_OPACITY,
  TEXT_FONT_SCALE,
  type DrawData,
  type DrawStroke,
  type DrawFillStyle,
  type DrawStrokeStyle,
  type DrawStrokeType,
  type DrawRenderOptions,
} from './drawEngine'

function stroke(type: DrawStrokeType, points: [number, number][] = [[0, 0], [10, 10]]): DrawStroke {
  return {
    type,
    points: points.map(([x, y]) => ({ x, y })),
    color: '#000',
    size: 3,
    roughness: 1,
  }
}

const sampleData: DrawData = (() => {
  // Прогоняем через parseDrawData, чтобы получить каноническую форму
  // (со стабильными seed для каждого штриха) — именно так реальные данные
  // сохраняются и читаются, и так round-trip = toEqual проходит.
  const raw: DrawData = {
    version: 1,
    bgColor: '#fff',
    strokes: [
      stroke('rectangle', [[0, 0], [100, 50]]),
      stroke('freehand', [[5, 5], [6, 7], [9, 12]]),
    ],
    canvas: { ...DEFAULT_CANVAS_SIZE },
    camera: { ...DEFAULT_CAMERA },
  }
  return parseDrawData(serializeDrawData(raw))
})()

describe('drawEngine — serialize/parse round-trip', () => {
  it('round-trips a full DrawData through serialize → parse', () => {
    const json = serializeDrawData(sampleData)
    const parsed = parseDrawData(json)
    expect(parsed).toEqual(sampleData)
  })

  it('preserves pressure on freehand points', () => {
    const data = parseDrawData(serializeDrawData({
      ...DEFAULT_DRAW_DATA,
      strokes: [{ type: 'freehand', points: [{ x: 1, y: 2, p: 0.8 }, { x: 3, y: 4, p: 0.1 }], color: '#111', size: 2 }],
    }))
    const parsed = parseDrawData(serializeDrawData(data))
    expect(parsed).toEqual(data)
    // И явно — давление сохранилось.
    expect(parsed.strokes[0].points.map((p) => p.p)).toEqual([0.8, 0.1])
  })

  it('returns DEFAULT_DRAW_DATA for empty input', () => {
    expect(parseDrawData('')).toEqual(DEFAULT_DRAW_DATA)
  })

  it('returns DEFAULT_DRAW_DATA for malformed JSON', () => {
    expect(parseDrawData('{not json')).toEqual(DEFAULT_DRAW_DATA)
  })

  it('drops invalid strokes and keeps valid ones', () => {
    const json = JSON.stringify({
      version: 1,
      bgColor: 'transparent',
      strokes: [
        { type: 'line', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], color: '#000', size: 1 },
        { type: 'line', points: [], color: '#000', size: 1 },
        { type: 'line', points: [{ x: 'bad', y: 0 }] },
        'not-a-stroke',
      ],
    })
    const parsed = parseDrawData(json)
    expect(parsed.strokes).toHaveLength(1)
    expect(parsed.strokes[0].points).toHaveLength(2)
  })

  it('coerces unknown version to 1', () => {
    const parsed = parseDrawData(JSON.stringify({ version: 99, strokes: [], bgColor: 'red' }))
    expect(parsed.version).toBe(1)
    expect(parsed.bgColor).toBe('red')
  })
})

describe('drawEngine — текстовые штрихи', () => {
  function textStroke(text: string, x = 10, y = 20, size = 3): DrawStroke {
    return { type: 'text', points: [{ x, y }], color: '#222', size, text }
  }

  it('round-trips a text stroke preserving its content', () => {
    const data = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [textStroke('Привет\nмир')] }))
    expect(data.strokes).toHaveLength(1)
    expect(data.strokes[0].type).toBe('text')
    expect(data.strokes[0].text).toBe('Привет\nмир')
  })

  it('drops a text stroke without text content', () => {
    const json = JSON.stringify({
      version: 1,
      bgColor: 'transparent',
      strokes: [
        { type: 'text', points: [{ x: 0, y: 0 }], color: '#000', size: 3 },
        { type: 'text', points: [{ x: 0, y: 0 }], color: '#000', size: 3, text: '' },
        { type: 'text', points: [{ x: 0, y: 0 }], color: '#000', size: 3, text: 'ok' },
      ],
    })
    const parsed = parseDrawData(json)
    expect(parsed.strokes).toHaveLength(1)
    expect(parsed.strokes[0].text).toBe('ok')
  })

  it('derives font size from stroke size via TEXT_FONT_SCALE', () => {
    expect(textFontSize(textStroke('a', 0, 0, 4))).toBe(4 * TEXT_FONT_SCALE)
  })

  it('computes an extended bbox for text (single anchor point)', () => {
    const b = strokeBBox(textStroke('hello', 100, 200, 4))
    // Бокс расширяется вправо/вниз от якоря по числу символов/строк.
    expect(b.minX).toBe(100)
    expect(b.minY).toBe(200)
    expect(b.maxX).toBeGreaterThan(100)
    expect(b.maxY).toBeGreaterThan(200)
  })

  it('renders a native <text> element (not foreignObject)', async () => {
    const inner = await renderStrokesToSvgInner([textStroke('Hi\nthere')])
    expect(inner).toContain('<text')
    expect(inner).toContain('Hi')
    expect(inner).toContain('there')
    // Многострочность через <tspan>, без foreignObject (растрируется в экспорте).
    expect(inner).toContain('<tspan')
    expect(inner).not.toContain('foreignObject')
  })
})

describe('drawEngine — стабильные id и пересечение прямоугольников', () => {
  it('assigns an id to a stroke without one and preserves it on round-trip', () => {
    const a = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [stroke('line')] }))
    expect(typeof a.strokes[0].id).toBe('string')
    expect(a.strokes[0].id).toBeTruthy()
    // id стабилен между повторными парсингами.
    const b = parseDrawData(serializeDrawData(a))
    expect(b.strokes[0].id).toBe(a.strokes[0].id)
  })

  it('assigns distinct ids to distinct strokes', () => {
    const parsed = parseDrawData(serializeDrawData({
      ...DEFAULT_DRAW_DATA,
      strokes: [stroke('line', [[0, 0], [1, 1]]), stroke('line', [[2, 2], [3, 3]])],
    }))
    expect(parsed.strokes[0].id).not.toBe(parsed.strokes[1].id)
  })

  it('rectsIntersect detects overlap, touch and separation', () => {
    const a = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
    expect(rectsIntersect(a, { minX: 5, minY: 5, maxX: 15, maxY: 15 })).toBe(true)
    expect(rectsIntersect(a, { minX: 10, minY: 10, maxX: 20, maxY: 20 })).toBe(true) // касание
    expect(rectsIntersect(a, { minX: 11, minY: 0, maxX: 20, maxY: 10 })).toBe(false)
  })
})

describe('drawEngine — поворот штрихов', () => {
  function rotatedRect(rotation: number): DrawStroke {
    return { type: 'rectangle', points: [{ x: 0, y: 0 }, { x: 100, y: 100 }], color: '#000', size: 3, rotation }
  }

  it('round-trips rotation and ignores zero rotation', () => {
    const a = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [rotatedRect(Math.PI / 4)] }))
    expect(a.strokes[0].rotation).toBeCloseTo(Math.PI / 4, 6)
    const z = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [rotatedRect(0)] }))
    expect(z.strokes[0].rotation).toBeUndefined()
  })

  it('strokeBBox grows to the rotated AABB (45° square)', () => {
    const b = strokeBBox(rotatedRect(Math.PI / 4))
    // Квадрат 100×100, повёрнутый на 45° вокруг центра (50,50): диагональ ≈141.4,
    // поэтому AABB примерно [-20.7..120.7] по обеим осям.
    expect(b.minX).toBeCloseTo(50 - 70.71, 1)
    expect(b.maxX).toBeCloseTo(50 + 70.71, 1)
    expect(b.minY).toBeCloseTo(50 - 70.71, 1)
  })

  it('renders rotation as a <g transform="rotate(...)"> wrapper', async () => {
    const inner = await renderStrokesToSvgInner([rotatedRect(Math.PI / 2)])
    expect(inner).toContain('<g transform="rotate(90 50 50)">')
  })
})

describe('drawEngine — generateDrawId', () => {
  it('produces two distinct ids', () => {
    const a = generateDrawId()
    const b = generateDrawId()
    expect(a).toBeTruthy()
    expect(b).toBeTruthy()
    expect(a).not.toBe(b)
  })
})

describe('drawEngine — computeBounds', () => {
  it('returns zeros for an empty stroke set', () => {
    expect(computeBounds([])).toEqual({ minX: 0, minY: 0, maxX: 0, maxY: 0 })
  })

  it('computes the bounding box across all strokes', () => {
    const bounds = computeBounds([
      stroke('line', [[10, 20], [30, 5]]),
      stroke('line', [[0, 40], [50, 0]]),
    ])
    expect(bounds).toEqual({ minX: 0, minY: 0, maxX: 50, maxY: 40 })
  })
})

describe('drawEngine — svgPathFromPoints', () => {
  it('returns empty string for no points', () => {
    expect(svgPathFromPoints([])).toBe('')
  })

  it('starts with a Move command', () => {
    const d = svgPathFromPoints([[1, 2], [3, 4]])
    expect(d.startsWith('M 1,2')).toBe(true)
  })

  it('closes the path', () => {
    const d = svgPathFromPoints([[1, 2], [3, 4], [5, 6]])
    expect(d.endsWith('Z')).toBe(true)
  })
})

describe('drawEngine — стабильный seed штрихов', () => {
  it('assigns a deterministic seed derived from the stroke content', () => {
    const a = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [stroke('rectangle', [[0, 0], [10, 10]])] }))
    const b = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [stroke('rectangle', [[0, 0], [10, 10]])] }))
    expect(typeof a.strokes[0].seed).toBe('number')
    // Одинаковый контент → одинаковый seed → фигура не «шевелится» при перерисовке.
    expect(a.strokes[0].seed).toBe(b.strokes[0].seed)
  })

  it('produces different seeds for different strokes', () => {
    const parsed = parseDrawData(serializeDrawData({
      ...DEFAULT_DRAW_DATA,
      strokes: [stroke('rectangle', [[0, 0], [10, 10]]), stroke('rectangle', [[0, 0], [20, 20]])],
    }))
    expect(parsed.strokes[0].seed).not.toBe(parsed.strokes[1].seed)
  })

  it('preserves an explicitly stored seed across round-trips', () => {
    const withSeed = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [{ ...stroke('line'), seed: 12345 }] }))
    expect(withSeed.strokes[0].seed).toBe(12345)
  })
})

describe('drawEngine — маркер (highlighter)', () => {
  function highlighter(points: [number, number][], color = '#ffeb3b'): DrawStroke {
    return { type: 'highlighter', points: points.map(([x, y]) => ({ x, y })), color, size: 4 }
  }

  it('isFreehandType: true для freehand и highlighter, false для прочих', () => {
    expect(isFreehandType('freehand')).toBe(true)
    expect(isFreehandType('highlighter')).toBe(true)
    expect(isFreehandType('rectangle')).toBe(false)
    expect(isFreehandType('text')).toBe(false)
  })

  it('рендерит highlighter как полупрозрачную заливку (fill-opacity)', async () => {
    const inner = await renderStrokesToSvgInner([highlighter([[0, 0], [20, 0], [40, 0]])])
    expect(inner).toContain('<path')
    expect(inner).toContain('#ffeb3b')
    expect(inner).toContain(`fill-opacity="${String(HIGHLIGHTER_OPACITY)}"`)
  })

  it('всегда рисует highlighter ПОД остальными штрихами, независимо от порядка', async () => {
    // Маркер добавлен ВТОРЫМ (поверх по z-order), но в SVG должен идти первым.
    const rect: DrawStroke = { type: 'rectangle', points: [{ x: 0, y: 0 }, { x: 50, y: 50 }], color: '#111', size: 2 }
    const mark = highlighter([[0, 0], [50, 50]])
    const inner = await renderStrokesToSvgInner([rect, mark])
    const markIdx = inner.indexOf(`fill-opacity="${String(HIGHLIGHTER_OPACITY)}"`)
    const rectColorIdx = inner.indexOf('#111')
    expect(markIdx).toBeGreaterThanOrEqual(0)
    expect(rectColorIdx).toBeGreaterThanOrEqual(0)
    expect(markIdx).toBeLessThan(rectColorIdx)
  })
})

describe('drawEngine — стилевые поля штриха (fillColor/fillStyle/strokeStyle/opacity)', () => {
  // Вспомогательные типы для явной проверки экспортируемых алиасов.
  const _fillStyle: DrawFillStyle = 'solid'
  const _strokeStyle: DrawStrokeStyle = 'dashed'
  // Просто убеждаемся, что типы компилируются (присвоение выше не вызовет ошибку).
  void _fillStyle
  void _strokeStyle

  it('рендерит rectangle с fillColor — в SVG присутствует нужный цвет', async () => {
    const s: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 10, y: 10 }, { x: 100, y: 80 }],
      color: '#000000',
      size: 2,
      fillColor: '#ff0000',
    }
    const inner = await renderStrokesToSvgInner([s])
    expect(inner).toContain('#ff0000')
  })

  it('рендерит line с strokeStyle dashed — в SVG есть stroke-dasharray', async () => {
    const s: DrawStroke = {
      type: 'line',
      points: [{ x: 0, y: 0 }, { x: 50, y: 50 }],
      color: '#333',
      size: 3,
      strokeStyle: 'dashed',
    }
    const inner = await renderStrokesToSvgInner([s])
    expect(inner).toContain('stroke-dasharray')
  })

  it('рендерит штрих с opacity=0.5 — обёртка <g> с атрибутом opacity', async () => {
    const s: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 40, y: 40 }],
      color: '#000',
      size: 2,
      opacity: 0.5,
    }
    const inner = await renderStrokesToSvgInner([s])
    expect(inner).toContain('<g ')
    expect(inner).toContain('opacity="0.5"')
  })

  it('round-trip сохраняет fillColor/fillStyle/strokeStyle/opacity', () => {
    const original: DrawStroke = {
      type: 'ellipse',
      points: [{ x: 0, y: 0 }, { x: 60, y: 40 }],
      color: '#0000ff',
      size: 2,
      fillColor: '#aabbcc',
      fillStyle: 'solid',
      strokeStyle: 'dotted',
      opacity: 0.3,
    }
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [original] }
    const parsed = parseDrawData(serializeDrawData(data))
    const s = parsed.strokes[0]
    expect(s.fillColor).toBe('#aabbcc')
    expect(s.fillStyle).toBe('solid')
    expect(s.strokeStyle).toBe('dotted')
    expect(s.opacity).toBeCloseTo(0.3, 5)
  })

  it('normalizeStroke опускает дефолтные fillStyle/strokeStyle/opacity', () => {
    const original: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 20, y: 20 }],
      color: '#000',
      size: 2,
      fillStyle: 'hachure',   // дефолт — опускается
      strokeStyle: 'solid',   // дефолт — опускается
      opacity: 1,             // дефолт — опускается
    }
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [original] }
    const parsed = parseDrawData(serializeDrawData(data))
    const s = parsed.strokes[0]
    expect(s.fillStyle).toBeUndefined()
    expect(s.strokeStyle).toBeUndefined()
    expect(s.opacity).toBeUndefined()
  })

  it('штрихи с разным fillColor имеют разный seed (hashStroke чувствителен к стилю)', () => {
    const base: Partial<DrawStroke> = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 50, y: 50 }],
      color: '#000',
      size: 2,
    }
    const a = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [{ ...base, fillColor: '#ff0000' } as DrawStroke] }))
    const b = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [{ ...base, fillColor: '#00ff00' } as DrawStroke] }))
    expect(a.strokes[0].seed).not.toBe(b.strokes[0].seed)
  })

  it('одинаковые штрихи с одинаковым стилем дают одинаковый seed', () => {
    const s: DrawStroke = {
      type: 'diamond',
      points: [{ x: 5, y: 5 }, { x: 55, y: 55 }],
      color: '#111',
      size: 3,
      fillColor: '#cccccc',
      strokeStyle: 'dashed',
    }
    const a = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [s] }))
    const b = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [s] }))
    expect(a.strokes[0].seed).toBe(b.strokes[0].seed)
  })

  it('opacity и rotation вместе — один <g> с обоими атрибутами', async () => {
    const s: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      opacity: 0.7,
      rotation: Math.PI / 4,
    }
    const inner = await renderStrokesToSvgInner([s])
    // Должна быть ровно одна <g> с обоими атрибутами (не вложенные <g>).
    expect(inner).toContain('opacity="0.7"')
    expect(inner).toContain('transform="rotate(')
    // Не должно быть двух вложенных <g> подряд
    expect(inner).not.toContain('<g ><g ')
  })
})

describe('drawEngine — groupId и locked (новые поля)', () => {
  it('round-trip сохраняет groupId и locked если заданы', () => {
    const s: DrawStroke = {
      type: 'line',
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      color: '#000',
      size: 2,
      groupId: 'group-42',
      locked: true,
    }
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [s] }
    const parsed = parseDrawData(serializeDrawData(data))
    expect(parsed.strokes[0].groupId).toBe('group-42')
    expect(parsed.strokes[0].locked).toBe(true)
  })

  it('НЕ добавляет groupId/locked там, где они не заданы', () => {
    const s: DrawStroke = {
      type: 'line',
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      color: '#000',
      size: 2,
    }
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [s] }
    const parsed = parseDrawData(serializeDrawData(data))
    expect(parsed.strokes[0].groupId).toBeUndefined()
    expect(parsed.strokes[0].locked).toBeUndefined()
  })

  it('НЕ добавляет groupId для пустой строки и locked для false', () => {
    const s: DrawStroke = {
      type: 'line',
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      color: '#000',
      size: 2,
      groupId: '',
      locked: false,
    }
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [s] }
    const parsed = parseDrawData(serializeDrawData(data))
    expect(parsed.strokes[0].groupId).toBeUndefined()
    expect(parsed.strokes[0].locked).toBeUndefined()
  })

  it('hashStroke инвариантен к groupId/locked — одинаковые штрихи отличаются только groupId/locked, seed одинаков', () => {
    const base: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 5, y: 5 }, { x: 55, y: 55 }],
      color: '#333',
      size: 3,
    }
    const withGroup: DrawStroke = { ...base, groupId: 'grp-1', locked: true }
    const withOtherGroup: DrawStroke = { ...base, groupId: 'grp-2', locked: false }

    const a = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [base] }))
    const b = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [withGroup] }))
    const c = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [withOtherGroup] }))

    // Все три вычислили seed из одного и того же контента — он должен совпасть.
    expect(a.strokes[0].seed).toBe(b.strokes[0].seed)
    expect(a.strokes[0].seed).toBe(c.strokes[0].seed)
  })
})

describe('drawEngine — translateStroke', () => {
  it('сдвигает все точки на (dx, dy)', () => {
    const s: DrawStroke = {
      type: 'line',
      points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
      color: '#000',
      size: 2,
    }
    const result = translateStroke(s, 5, -10)
    expect(result.points[0]).toEqual({ x: 15, y: 10 })
    expect(result.points[1]).toEqual({ x: 35, y: 30 })
  })

  it('не мутирует исходный объект', () => {
    const s: DrawStroke = {
      type: 'line',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 1,
    }
    const original0 = { ...s.points[0] }
    translateStroke(s, 50, 50)
    // Исходные точки не изменились.
    expect(s.points[0]).toEqual(original0)
  })

  it('сохраняет давление p в точках при сдвиге', () => {
    const s: DrawStroke = {
      type: 'freehand',
      points: [{ x: 1, y: 2, p: 0.7 }, { x: 3, y: 4, p: 0.3 }],
      color: '#000',
      size: 2,
    }
    const result = translateStroke(s, 10, 20)
    expect(result.points[0].p).toBe(0.7)
    expect(result.points[1].p).toBe(0.3)
  })
})

describe('drawEngine — reflectStroke', () => {
  it('axis h: каждый x → 2*center - x, y без изменений', () => {
    const s: DrawStroke = {
      type: 'line',
      points: [{ x: 10, y: 5 }, { x: 30, y: 15 }],
      color: '#000',
      size: 2,
    }
    const result = reflectStroke(s, 'h', 20)
    expect(result.points[0].x).toBeCloseTo(30) // 2*20 - 10
    expect(result.points[0].y).toBeCloseTo(5)   // y без изменений
    expect(result.points[1].x).toBeCloseTo(10)  // 2*20 - 30
    expect(result.points[1].y).toBeCloseTo(15)
  })

  it('axis v: каждый y → 2*center - y, x без изменений', () => {
    const s: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 5, y: 10 }, { x: 50, y: 40 }],
      color: '#000',
      size: 2,
    }
    const result = reflectStroke(s, 'v', 25)
    expect(result.points[0].x).toBeCloseTo(5)   // x без изменений
    expect(result.points[0].y).toBeCloseTo(40)  // 2*25 - 10
    expect(result.points[1].x).toBeCloseTo(50)
    expect(result.points[1].y).toBeCloseTo(10)  // 2*25 - 40
  })

  it('rotation инвертируется при отражении (0.3 → -0.3)', () => {
    const s: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      rotation: 0.3,
    }
    const result = reflectStroke(s, 'h', 50)
    expect(result.rotation).toBeCloseTo(-0.3)
  })

  it('rotation отсутствует если не задан — не добавляется в результат', () => {
    const s: DrawStroke = {
      type: 'line',
      points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
      color: '#000',
      size: 2,
    }
    const result = reflectStroke(s, 'h', 5)
    expect(result.rotation).toBeUndefined()
  })

  it('text axis h: bbox отражается, ширина bbox сохраняется', () => {
    const s: DrawStroke = {
      type: 'text',
      points: [{ x: 100, y: 50 }],
      color: '#000',
      size: 4,
      text: 'Hello',
    }
    const b = strokeBBox(s)
    const center = 200
    const result = reflectStroke(s, 'h', center)
    const rb = strokeBBox(result)
    // Новый левый край должен совпасть с 2*center - старый правый.
    expect(rb.minX).toBeCloseTo(2 * center - b.maxX, 3)
    // Ширина bbox сохранена.
    expect(rb.maxX - rb.minX).toBeCloseTo(b.maxX - b.minX, 3)
  })

  it('text axis v: bbox отражается по вертикали, высота bbox сохраняется', () => {
    const s: DrawStroke = {
      type: 'text',
      points: [{ x: 50, y: 100 }],
      color: '#000',
      size: 3,
      text: 'Test\nLine',
    }
    const b = strokeBBox(s)
    const center = 200
    const result = reflectStroke(s, 'v', center)
    const rb = strokeBBox(result)
    // Новый верхний край = 2*center - нижний край.
    expect(rb.minY).toBeCloseTo(2 * center - b.maxY, 3)
    // Высота bbox сохранена.
    expect(rb.maxY - rb.minY).toBeCloseTo(b.maxY - b.minY, 3)
  })

  it('text: rotation инвертируется', () => {
    const s: DrawStroke = {
      type: 'text',
      points: [{ x: 10, y: 10 }],
      color: '#000',
      size: 3,
      text: 'Тест',
      rotation: 0.5,
    }
    const result = reflectStroke(s, 'h', 100)
    expect(result.rotation).toBeCloseTo(-0.5)
  })
})

describe('drawEngine — preview viewBox fits content', () => {
  // Для бесконечного холста preview показывает именно нарисованное (fit по bbox),
  // где бы оно ни находилось в world-координатах. Стабильность формы каждой
  // фигуры обеспечивает seed (отдельный тест выше), а пересчёт viewBox под
  // содержимое — ожидаемое поведение fit (как в Excalidraw/tldraw).
  it('uses content bounds for the viewBox so strokes are always visible', async () => {
    const canvas: DrawData['canvas'] = { width: 1600, height: 1000 }
    // Штрих далеко от начала координат (как после pan) — preview обязан его показать.
    const data: DrawData = { version: 1, bgColor: 'transparent', strokes: [stroke('rectangle', [[500, 400], [700, 600]])], canvas, camera: { ...DEFAULT_CAMERA } }
    const svg = await renderDrawToSvgString(data)
    const vb = svg.match(/viewBox="([^"]+)"/)![1].split(' ').map(Number)
    // viewBox должен охватывать штрих (с padding), а не фиксированный 0 0 1600 1000.
    expect(vb[0]).toBeLessThan(500)
    expect(vb[1]).toBeLessThan(400)
    expect(vb[0] + vb[2]).toBeGreaterThan(700)
    expect(vb[1] + vb[3]).toBeGreaterThan(600)
  })

  it('renders empty drawing with the default canvas viewBox (no crash)', async () => {
    const data: DrawData = { ...DEFAULT_DRAW_DATA }
    const svg = await renderDrawToSvgString(data)
    expect(svg.startsWith('<svg')).toBe(true)
    // Пустой рисунок → дефолтный canvas, чтобы preview имел размер.
    expect(svg).toContain('viewBox="0 0 1600 1000"')
  })

  it('renders a white paper background for the default transparent bgColor', async () => {
    const canvas: DrawData['canvas'] = { width: 1600, height: 1000 }
    const data: DrawData = { version: 1, bgColor: 'transparent', strokes: [stroke('rectangle', [[10, 10], [50, 50]])], canvas, camera: { ...DEFAULT_CAMERA } }
    const svg = await renderDrawToSvgString(data)
    // По умолчанию фон-бумага белый (как холст рисования), чтобы тёмные чернила
    // читались и в светлой, и в тёмной теме заметки.
    expect(svg).toContain('fill="#ffffff"')
  })

  it('honours an explicit bgColor as the paper background', async () => {
    const canvas: DrawData['canvas'] = { width: 1600, height: 1000 }
    const data: DrawData = { version: 1, bgColor: '#f0f8ff', strokes: [stroke('rectangle', [[10, 10], [50, 50]])], canvas, camera: { ...DEFAULT_CAMERA } }
    const svg = await renderDrawToSvgString(data)
    expect(svg).toContain('fill="#f0f8ff"')
    expect(svg).not.toContain('fill="#ffffff"')
  })
})

describe('drawEngine — image-штрих', () => {
  // Вспомогательный валидный image-штрих.
  function imageStroke(assetSrc = 'assets/img.png', naturalWidth = 800, naturalHeight = 600): DrawStroke {
    return {
      type: 'image',
      points: [{ x: 10, y: 20 }, { x: 110, y: 70 }],
      color: '#000',
      size: 1,
      assetSrc,
      naturalWidth,
      naturalHeight,
    }
  }

  it('round-trip через serialize/parse сохраняет image-штрих с assetSrc и naturalWidth/Height', () => {
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [imageStroke()] }
    const parsed = parseDrawData(serializeDrawData(data))
    expect(parsed.strokes).toHaveLength(1)
    const s = parsed.strokes[0]
    expect(s.type).toBe('image')
    expect(s.assetSrc).toBe('assets/img.png')
    expect(s.naturalWidth).toBe(800)
    expect(s.naturalHeight).toBe(600)
    expect(s.points).toHaveLength(2)
  })

  it('невалидный image без assetSrc отфильтровывается isValidStroke', () => {
    const invalidImage: DrawStroke = {
      type: 'image',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 1,
      // assetSrc намеренно отсутствует
    }
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [invalidImage] }
    const parsed = parseDrawData(serializeDrawData(data))
    expect(parsed.strokes).toHaveLength(0)
  })

  it('невалидный image с пустым assetSrc отфильтровывается isValidStroke', () => {
    const invalidImage: DrawStroke = {
      type: 'image',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 1,
      assetSrc: '',
    }
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [invalidImage] }
    const parsed = parseDrawData(serializeDrawData(data))
    expect(parsed.strokes).toHaveLength(0)
  })

  it('strokeBBox для image-штриха с points (10,20)→(110,70) даёт корректный bbox', () => {
    const b = strokeBBox(imageStroke())
    expect(b.minX).toBe(10)
    expect(b.minY).toBe(20)
    expect(b.maxX).toBe(110)
    expect(b.maxY).toBe(70)
  })

  it('рендер с resolveImageHref содержит <image и href с data-URI', async () => {
    const opts: DrawRenderOptions = {
      resolveImageHref: () => 'data:image/png;base64,AAAA',
    }
    const inner = await renderStrokesToSvgInner([imageStroke()], opts)
    expect(inner).toContain('<image')
    expect(inner).toContain('href="data:image/png;base64,AAAA"')
    expect(inner).not.toContain('stroke-dasharray')
  })

  it('рендер без resolveImageHref рендерит плейсхолдер <rect, не <image', async () => {
    const inner = await renderStrokesToSvgInner([imageStroke()])
    expect(inner).toContain('<rect')
    expect(inner).toContain('stroke-dasharray')
    expect(inner).not.toContain('<image')
  })

  it('два image-штриха с разным assetSrc получают разный seed после parseDrawData', () => {
    const a = parseDrawData(serializeDrawData({
      ...DEFAULT_DRAW_DATA,
      strokes: [imageStroke('assets/photo-a.png')],
    }))
    const b = parseDrawData(serializeDrawData({
      ...DEFAULT_DRAW_DATA,
      strokes: [imageStroke('assets/photo-b.png')],
    }))
    expect(typeof a.strokes[0].seed).toBe('number')
    expect(typeof b.strokes[0].seed).toBe('number')
    expect(a.strokes[0].seed).not.toBe(b.strokes[0].seed)
  })
})

describe('drawEngine — привязки стрелок (коннекторы)', () => {
  // --- round-trip ---

  it('round-trip: arrow с startBinding/endBinding сохраняет привязки', () => {
    const arrowStroke: DrawStroke = {
      type: 'arrow',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      startBinding: { strokeId: 'r1' },
      endBinding: { strokeId: 'r2', gap: 6 },
    }
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [arrowStroke] }
    const parsed = parseDrawData(serializeDrawData(data))
    expect(parsed.strokes).toHaveLength(1)
    const s = parsed.strokes[0]
    expect(s.startBinding).toBeDefined()
    expect(s.startBinding?.strokeId).toBe('r1')
    expect(s.endBinding).toBeDefined()
    expect(s.endBinding?.strokeId).toBe('r2')
    expect(s.endBinding?.gap).toBe(6)
  })

  it('round-trip: rectangle со startBinding — после нормализации привязки НЕТ', () => {
    const rectStroke: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      startBinding: { strokeId: 'r1' },
    }
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [rectStroke] }
    const parsed = parseDrawData(serializeDrawData(data))
    expect(parsed.strokes[0].startBinding).toBeUndefined()
  })

  it('round-trip: startBinding без strokeId — после нормализации привязки НЕТ', () => {
    const arrowStroke = {
      type: 'arrow' as const,
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      startBinding: { strokeId: '' },
    }
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [arrowStroke] }
    const parsed = parseDrawData(serializeDrawData(data))
    expect(parsed.strokes[0].startBinding).toBeUndefined()
  })

  it('round-trip: gap < 0 — поле gap опускается', () => {
    const arrowStroke: DrawStroke = {
      type: 'arrow',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      startBinding: { strokeId: 'r1', gap: -5 },
    }
    const data: DrawData = { ...DEFAULT_DRAW_DATA, strokes: [arrowStroke] }
    const parsed = parseDrawData(serializeDrawData(data))
    expect(parsed.strokes[0].startBinding?.strokeId).toBe('r1')
    expect(parsed.strokes[0].startBinding?.gap).toBeUndefined()
  })

  // --- isBindableType ---

  it('isBindableType: true для rectangle/ellipse/diamond/image/text', () => {
    expect(isBindableType('rectangle')).toBe(true)
    expect(isBindableType('ellipse')).toBe(true)
    expect(isBindableType('diamond')).toBe(true)
    expect(isBindableType('image')).toBe(true)
    expect(isBindableType('text')).toBe(true)
  })

  it('isBindableType: false для arrow/line/freehand', () => {
    expect(isBindableType('arrow')).toBe(false)
    expect(isBindableType('line')).toBe(false)
    expect(isBindableType('freehand')).toBe(false)
  })

  // --- arrowEndpointOnShape ---

  it('arrowEndpointOnShape: toward справа — точка на правом крае bbox + gap', () => {
    const rect: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
    }
    const gap = 4
    const result = arrowEndpointOnShape(rect, { x: 500, y: 50 }, gap)
    // Точка должна быть на правом крае расширенного bbox.
    expect(result.x).toBeCloseTo(100 + gap, 1)
    // y должен быть примерно по центру (луч горизонтальный от (50,50) вправо).
    expect(result.y).toBeGreaterThanOrEqual(0 - gap)
    expect(result.y).toBeLessThanOrEqual(100 + gap)
  })

  it('arrowEndpointOnShape: toward сверху — точка на верхнем крае bbox + gap', () => {
    const rect: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
    }
    const gap = 4
    const result = arrowEndpointOnShape(rect, { x: 50, y: -500 }, gap)
    // Точка должна быть на верхнем крае расширенного bbox.
    expect(result.y).toBeCloseTo(0 - gap, 1)
    expect(result.x).toBeGreaterThanOrEqual(0 - gap)
    expect(result.x).toBeLessThanOrEqual(100 + gap)
  })

  it('arrowEndpointOnShape: toward == center → возвращает center без ошибки', () => {
    const rect: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
    }
    // Центр bbox = (50, 50). toward = (50, 50) → |d| ≈ 0 → возвращает центр.
    const result = arrowEndpointOnShape(rect, { x: 50, y: 50 }, 4)
    expect(result.x).toBeCloseTo(50, 1)
    expect(result.y).toBeCloseTo(50, 1)
  })

  // --- reflowBoundArrows ---

  it('reflowBoundArrows: стрелка с двумя привязками — концы на краях фигур', () => {
    const gap = 4
    const rectA: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      id: 'a',
    }
    const rectB: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 300, y: 0 }, { x: 400, y: 100 }],
      color: '#000',
      size: 2,
      id: 'b',
    }
    const arrowStroke: DrawStroke = {
      type: 'arrow',
      points: [{ x: 50, y: 50 }, { x: 350, y: 50 }],
      color: '#000',
      size: 2,
      id: 'arr',
      startBinding: { strokeId: 'a', gap },
      endBinding: { strokeId: 'b', gap },
    }
    const result = reflowBoundArrows([rectA, rectB, arrowStroke])
    const arr = result.find((s) => s.id === 'arr')!
    // points[0] (start) должен быть на правом крае rectA + gap.
    expect(arr.points[0].x).toBeCloseTo(100 + gap, 1)
    // points[1] (end) должен быть на левом крае rectB - gap.
    expect(arr.points[1].x).toBeCloseTo(300 - gap, 1)
  })

  it('reflowBoundArrows: сдвиг якорной фигуры → точка стрелки смещается', () => {
    const gap = 4
    const rectA: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      id: 'a',
    }
    const arrowStroke: DrawStroke = {
      type: 'arrow',
      points: [{ x: 50, y: 50 }, { x: 500, y: 50 }],
      color: '#000',
      size: 2,
      id: 'arr',
      startBinding: { strokeId: 'a', gap },
    }
    // Сдвинем rectA вправо на +200.
    const movedRectA: DrawStroke = {
      ...rectA,
      points: [{ x: 200, y: 0 }, { x: 300, y: 100 }],
    }
    const result = reflowBoundArrows([movedRectA, arrowStroke])
    const arr = result.find((s) => s.id === 'arr')!
    // points[0] должен сместиться к правому краю нового положения rectA.
    expect(arr.points[0].x).toBeCloseTo(300 + gap, 1)
  })

  it('reflowBoundArrows: удалённая якорная фигура → привязка снимается, points не падают', () => {
    const rectA: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      id: 'a',
    }
    const arrowStroke: DrawStroke = {
      type: 'arrow',
      points: [{ x: 50, y: 50 }, { x: 350, y: 50 }],
      color: '#000',
      size: 2,
      id: 'arr',
      startBinding: { strokeId: 'a' },
      endBinding: { strokeId: 'b' },  // 'b' не существует в массиве
    }
    // Массив только без rectB (b не было), rectA присутствует.
    const result = reflowBoundArrows([rectA, arrowStroke])
    const arr = result.find((s) => s.id === 'arr')!
    // endBinding должна быть снята (фигура 'b' не найдена).
    expect(arr.endBinding).toBeUndefined()
    // startBinding остаётся (фигура 'a' есть).
    expect(arr.startBinding?.strokeId).toBe('a')
  })

  it('reflowBoundArrows: не мутирует входной массив', () => {
    const rectA: DrawStroke = {
      type: 'rectangle',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      id: 'a',
    }
    const arrowStroke: DrawStroke = {
      type: 'arrow',
      points: [{ x: 50, y: 50 }, { x: 350, y: 50 }],
      color: '#000',
      size: 2,
      id: 'arr',
      startBinding: { strokeId: 'a' },
    }
    const originalPt0x = arrowStroke.points[0].x
    reflowBoundArrows([rectA, arrowStroke])
    // Исходный объект не мутирован.
    expect(arrowStroke.points[0].x).toBe(originalPt0x)
  })

  // --- seed не зависит от привязок ---

  it('seed одинаков для стрелок с одинаковым контентом, одна с привязкой, другая без', () => {
    const arrowWithBinding: DrawStroke = {
      type: 'arrow',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      startBinding: { strokeId: 'r1' },
    }
    const arrowWithoutBinding: DrawStroke = {
      type: 'arrow',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
    }
    const a = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [arrowWithBinding] }))
    const b = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [arrowWithoutBinding] }))
    // seed одинаков (привязки не участвуют в hashStroke).
    expect(a.strokes[0].seed).toBe(b.strokes[0].seed)
  })
})

describe('arrow shapes', () => {
  const pt = (x: number, y: number) => ({ x, y })

  it('buildArrowGeometry straight: points.length===2, tip===to, tangent===from', () => {
    const from = pt(0, 0)
    const to = pt(100, 0)
    const geom = buildArrowGeometry(from, to, 'straight')
    expect(geom.points).toHaveLength(2)
    expect(geom.tip.x).toBeCloseTo(to.x)
    expect(geom.tip.y).toBeCloseTo(to.y)
    expect(geom.tangent.x).toBeCloseTo(from.x)
    expect(geom.tangent.y).toBeCloseTo(from.y)
    expect(geom.shape).toBe('straight')
  })

  it('buildArrowGeometry orthogonal горизонталь-первой: 4 точки, прямые углы', () => {
    const from = pt(0, 0)
    const to = pt(100, 40)  // |dx|=100 >= |dy|=40 → горизонталь первой
    const geom = buildArrowGeometry(from, to, 'orthogonal')
    expect(geom.points).toHaveLength(4)
    // Первая и последняя === from/to.
    expect(geom.points[0].x).toBeCloseTo(from.x)
    expect(geom.points[0].y).toBeCloseTo(from.y)
    expect(geom.points[3].x).toBeCloseTo(to.x)
    expect(geom.points[3].y).toBeCloseTo(to.y)
    // Второй сегмент горизонтальный (points[1].y === from.y).
    expect(geom.points[1].y).toBeCloseTo(from.y)
    // Третий сегмент имеет тот же x, что points[2] (прямой угол).
    expect(geom.points[2].x).toBeCloseTo(geom.points[1].x)
    expect(geom.tip.x).toBeCloseTo(to.x)
    expect(geom.tip.y).toBeCloseTo(to.y)
  })

  it('buildArrowGeometry orthogonal вертикаль-первой: 4 точки, прямые углы', () => {
    const from = pt(0, 0)
    const to = pt(30, 100)  // |dx|=30 < |dy|=100 → вертикаль первой
    const geom = buildArrowGeometry(from, to, 'orthogonal')
    expect(geom.points).toHaveLength(4)
    expect(geom.points[0].x).toBeCloseTo(from.x)
    expect(geom.points[0].y).toBeCloseTo(from.y)
    expect(geom.points[3].x).toBeCloseTo(to.x)
    expect(geom.points[3].y).toBeCloseTo(to.y)
    // Второй сегмент вертикальный (points[1].x === from.x).
    expect(geom.points[1].x).toBeCloseTo(from.x)
    // Третий сегмент имеет тот же y, что points[2] (прямой угол).
    expect(geom.points[2].y).toBeCloseTo(geom.points[1].y)
  })

  it('buildArrowGeometry bezier с bend=40: control и apex смещены по перпендикуляру', () => {
    const from = pt(0, 0)
    const to = pt(100, 0)
    const geom = buildArrowGeometry(from, to, 'bezier', 40)
    expect(geom.control).toBeDefined()
    expect(geom.apex).toBeDefined()
    // Для горизонтальной хорды перпендикуляр направлен вверх (nx=0, ny=1) → control.y ≈ bend.
    expect(geom.control!.x).toBeCloseTo(50)
    expect(geom.control!.y).toBeCloseTo(40)
    // apex — середина смещения: b/2 = 20.
    expect(geom.apex!.y).toBeCloseTo(20)
    // tip === to.
    expect(geom.tip.x).toBeCloseTo(to.x)
    expect(geom.tip.y).toBeCloseTo(to.y)
    // 17 сэмплов (0..16 включительно).
    expect(geom.points).toHaveLength(17)
    expect(geom.shape).toBe('bezier')
  })

  it('buildArrowGeometry bezier без bend: контрольная точка смещена (b = 0.2 * len)', () => {
    const from = pt(0, 0)
    const to = pt(100, 0)
    const geom = buildArrowGeometry(from, to, 'bezier')
    // b = 0.2 * 100 = 20 → control.y ≈ 20 (перпендикуляр вверх).
    expect(geom.control).toBeDefined()
    expect(Math.abs(geom.control!.y)).toBeCloseTo(20)
  })

  it('normalizeStroke сохраняет arrowShape=orthogonal при round-trip', () => {
    const s: DrawStroke = {
      type: 'arrow',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      arrowShape: 'orthogonal',
    }
    const parsed = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [s] }))
    expect(parsed.strokes[0].arrowShape).toBe('orthogonal')
  })

  it('normalizeStroke НЕ сохраняет arrowShape=straight (дефолт)', () => {
    const s: DrawStroke = {
      type: 'arrow',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      arrowShape: 'straight',
    }
    const parsed = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [s] }))
    expect(parsed.strokes[0].arrowShape).toBeUndefined()
  })

  it('normalizeStroke НЕ сохраняет arrowShape если поле отсутствует', () => {
    const s: DrawStroke = {
      type: 'arrow',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
    }
    const parsed = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [s] }))
    expect(parsed.strokes[0].arrowShape).toBeUndefined()
  })

  it('normalizeStroke сохраняет bend только при bezier', () => {
    const bezierStroke: DrawStroke = {
      type: 'arrow',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      arrowShape: 'bezier',
      bend: 30,
    }
    const parsed = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [bezierStroke] }))
    expect(parsed.strokes[0].arrowShape).toBe('bezier')
    expect(parsed.strokes[0].bend).toBe(30)
  })

  it('normalizeStroke НЕ сохраняет bend при orthogonal', () => {
    const orthStroke: DrawStroke = {
      type: 'arrow',
      points: [{ x: 0, y: 0 }, { x: 100, y: 100 }],
      color: '#000',
      size: 2,
      arrowShape: 'orthogonal',
      bend: 30,
    }
    const parsed = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [orthStroke] }))
    expect(parsed.strokes[0].bend).toBeUndefined()
  })

  it('normalizeStroke сохраняет недефолтные наконечники (startCap=dot, endCap=none)', () => {
    const s: DrawStroke = {
      type: 'arrow',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      color: '#000',
      size: 2,
      startCap: 'dot',
      endCap: 'none',
    }
    const parsed = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [s] }))
    expect(parsed.strokes[0].startCap).toBe('dot')
    expect(parsed.strokes[0].endCap).toBe('none')
  })

  it('normalizeStroke НЕ сохраняет дефолтные наконечники (startCap=none, endCap=arrow)', () => {
    const s: DrawStroke = {
      type: 'arrow',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      color: '#000',
      size: 2,
      startCap: 'none',
      endCap: 'arrow',
    }
    const parsed = parseDrawData(serializeDrawData({ ...DEFAULT_DRAW_DATA, strokes: [s] }))
    expect(parsed.strokes[0].startCap).toBeUndefined()
    expect(parsed.strokes[0].endCap).toBeUndefined()
  })

  it('рендер: endCap=none убирает наконечник (меньше путей, чем у дефолтной стрелки)', async () => {
    const base = (extra: Partial<DrawStroke>): DrawStroke => ({
      type: 'arrow', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: '#000', size: 2, ...extra,
    })
    const count = (s: string) => s.split('<path').length - 1
    const def = await renderStrokesToSvgInner([base({})])
    const none = await renderStrokesToSvgInner([base({ endCap: 'none' })])
    expect(count(none)).toBeLessThan(count(def))
  })

  it('рендер: endCap=dot даёт залитый кружок цветом обводки', async () => {
    const s: DrawStroke = {
      type: 'arrow', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], color: '#123456', size: 2, endCap: 'dot',
    }
    const inner = await renderStrokesToSvgInner([s])
    expect(inner).toContain('fill="#123456"')
  })
})
