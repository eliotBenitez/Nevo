import { describe, expect, it } from 'vitest'
import { DRAW_TEMPLATES } from './drawTemplates'
import { renderDrawToSvgString, DEFAULT_DRAW_DATA, type DrawStrokeType } from './drawEngine'

const KNOWN_TYPES: DrawStrokeType[] = [
  'freehand', 'highlighter', 'rectangle', 'line', 'arrow', 'ellipse', 'diamond', 'text', 'image',
]

describe('drawTemplates — коллекция шаблонов', () => {
  it('не пустая и содержит обе категории', () => {
    expect(DRAW_TEMPLATES.length).toBeGreaterThan(0)
    const cats = new Set(DRAW_TEMPLATES.map((t) => t.category))
    expect(cats.has('ui')).toBe(true)
    expect(cats.has('diagram')).toBe(true)
  })

  it('у всех шаблонов уникальные id', () => {
    const ids = DRAW_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('build() возвращает валидные штрихи (тип/точки/цвет/размер)', () => {
    for (const tpl of DRAW_TEMPLATES) {
      const strokes = tpl.build()
      expect(strokes.length, tpl.id).toBeGreaterThan(0)
      for (const s of strokes) {
        expect(KNOWN_TYPES, `${tpl.id}: ${s.type}`).toContain(s.type)
        expect(typeof s.color).toBe('string')
        expect(typeof s.size).toBe('number')
        expect(s.points.length).toBeGreaterThanOrEqual(1)
        if (s.type !== 'text') expect(s.points.length).toBeGreaterThanOrEqual(2)
        if (s.type === 'text') expect(typeof s.text).toBe('string')
      }
    }
  })

  it('build() возвращает свежий независимый массив при каждом вызове', () => {
    for (const tpl of DRAW_TEMPLATES) {
      const a = tpl.build()
      const b = tpl.build()
      expect(a).not.toBe(b)
      expect(a).toEqual(b)
      // Мутация одной копии не влияет на другую.
      a[0].points[0].x += 999
      expect(a[0].points[0].x).not.toBe(b[0].points[0].x)
    }
  })

  it('каждый шаблон рендерится в непустой SVG', async () => {
    for (const tpl of DRAW_TEMPLATES) {
      const svg = await renderDrawToSvgString({ ...DEFAULT_DRAW_DATA, strokes: tpl.build() }, 8)
      expect(svg, tpl.id).toContain('<svg')
    }
  })
})
