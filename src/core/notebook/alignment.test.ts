import { describe, expect, it } from 'vitest'
import { alignNotebookSelection, distributeNotebookSelection, notebookSelectionUnits } from './alignment'
import { notebookSelectionBounds } from './selectionTransform'
import type { NotebookImageV1, NotebookObjectV1, NotebookPageV1, NotebookStrokeV1 } from './types'

function box(id: string, x: number, y: number, w: number, h: number, actionId = id, width = 0): NotebookStrokeV1 {
  return {
    id, actionId, kind: 'stroke', color: '#123456', width, opacity: 1,
    points: [{ x, y }, { x: x + w, y: y + h }],
  }
}

function pageOf(objects: NotebookObjectV1[]): NotebookPageV1 {
  return { id: 'p', width: 400, height: 300, paper: { kind: 'plain' }, objects }
}

const bounds = (page: NotebookPageV1, id: string) => notebookSelectionBounds(page.objects.filter(object => object.id === id))!

describe('notebook alignment', () => {
  const page = pageOf([box('a', 50, 40, 20, 20), box('b', 120, 100, 40, 30), box('c', 250, 200, 10, 10)])
  const ids = ['a', 'b', 'c']
  const edges = {
    left: (b: ReturnType<typeof bounds>) => b.x,
    right: (b: ReturnType<typeof bounds>) => b.x + b.width,
    center: (b: ReturnType<typeof bounds>) => b.x + b.width / 2,
    top: (b: ReturnType<typeof bounds>) => b.y,
    bottom: (b: ReturnType<typeof bounds>) => b.y + b.height,
    middle: (b: ReturnType<typeof bounds>) => b.y + b.height / 2,
  }

  it.each([
    ['left', 50], ['right', 260], ['center', 155], ['top', 40], ['bottom', 210], ['middle', 125],
  ] as const)('aligns %s to the selection bounds', (mode, expected) => {
    const next = alignNotebookSelection(page, ids, mode)
    for (const id of ids) expect(edges[mode](bounds(next, id))).toBe(expected)
  })

  it('aligns a single group to the page', () => {
    const single = pageOf([box('a', 50, 40, 20, 20)])
    expect(edges.right(bounds(alignNotebookSelection(single, ['a'], 'right'), 'a'))).toBe(400)
    expect(edges.center(bounds(alignNotebookSelection(single, ['a'], 'center'), 'a'))).toBe(200)
    expect(edges.middle(bounds(alignNotebookSelection(single, ['a'], 'middle'), 'a'))).toBe(150)
    expect(edges.top(bounds(alignNotebookSelection(single, ['a'], 'top'), 'a'))).toBe(0)
  })

  it('moves an arrow made of several strokes as one rigid group', () => {
    const arrow = [box('s1', 100, 100, 50, 0, 'arrow'), box('s2', 150, 100, -10, -10, 'arrow'), box('s3', 150, 100, -10, 10, 'arrow')]
    const other = box('o', 300, 50, 10, 10)
    const next = alignNotebookSelection(pageOf([...arrow, other]), ['s1', 's2', 's3', 'o'], 'top')
    // Arrow bounds start at y 90; the group top moves to the shared top (50).
    const dy = next.objects[0].points[0].y - 100
    expect(dy).toBe(-40)
    arrow.forEach((original, index) => original.points.forEach((point, i) => {
      expect(next.objects[index].points[i]).toEqual({ x: point.x, y: point.y + dy })
    }))
    expect(next.objects[3]).toBe(other)
  })

  it('does not pull unselected parts of an action into the group', () => {
    const first = box('p1', 10, 10, 10, 10, 'long'), second = box('p2', 100, 100, 10, 10, 'long')
    const source = pageOf([first, second])
    const next = alignNotebookSelection(source, ['p1'], 'right')
    expect(next.objects[1]).toBe(second)
    expect(next.objects[0]).not.toBe(first)
    expect(notebookSelectionUnits(source, ['p1'])).toHaveLength(1)
  })

  it('accounts for stroke margins and image corners', () => {
    const marker = box('m', 100, 100, 20, 20, 'm', 10)
    const image: NotebookImageV1 = {
      id: 'i', actionId: 'i', kind: 'image', src: '.nevo/assets/x.png', opacity: 1,
      points: [{ x: 200, y: 50 }, { x: 260, y: 50 }, { x: 260, y: 90 }, { x: 200, y: 90 }],
    }
    const next = alignNotebookSelection(pageOf([marker, image]), ['m', 'i'], 'left')
    expect(bounds(next, 'm').x).toBe(95)
    expect(bounds(next, 'i').x).toBe(95)
    expect(next.objects[1].points.map(point => point.x)).toEqual([95, 155, 155, 95])
  })

  it('distributes groups of different sizes with equal gaps and fixed extremes', () => {
    const items = pageOf([box('a', 10, 10, 20, 10), box('b', 60, 50, 50, 10), box('c', 130, 90, 10, 10), box('d', 300, 20, 40, 10)])
    const all = ['a', 'b', 'c', 'd']
    const next = distributeNotebookSelection(items, all, 'horizontal')
    const [a, b, c, d] = all.map(id => bounds(next, id))
    expect(a.x).toBe(10)
    expect(d.x).toBe(300)
    expect(b.x - (a.x + a.width)).toBeCloseTo(c.x - (b.x + b.width))
    expect(c.x - (b.x + b.width)).toBeCloseTo(d.x - (c.x + c.width))
    expect(b.y).toBe(50)
    const vertical = distributeNotebookSelection(items, all, 'vertical')
    expect(bounds(vertical, 'a').y).toBe(10)
    expect(bounds(vertical, 'b').x).toBe(60)
  })

  it('allows a negative gap when groups overlap', () => {
    const items = pageOf([box('a', 10, 10, 100, 10), box('b', 20, 40, 60, 10), box('c', 50, 70, 100, 10)])
    const next = distributeNotebookSelection(items, ['a', 'b', 'c'], 'horizontal')
    const [a, b, c] = ['a', 'b', 'c'].map(id => bounds(next, id))
    expect(b.x - (a.x + a.width)).toBeCloseTo(c.x - (b.x + b.width))
    expect(b.x - (a.x + a.width)).toBeLessThan(0)
  })

  it('returns the same page when nothing moves or distribution lacks three groups', () => {
    const aligned = pageOf([box('a', 50, 10, 20, 20), box('b', 120, 10, 40, 20)])
    expect(alignNotebookSelection(aligned, ['a', 'b'], 'top')).toBe(aligned)
    expect(distributeNotebookSelection(aligned, ['a', 'b'], 'horizontal')).toBe(aligned)
    expect(alignNotebookSelection(aligned, [], 'left')).toBe(aligned)
    const even = pageOf([box('a', 10, 0, 10, 10), box('b', 30, 0, 10, 10), box('c', 50, 0, 10, 10)])
    expect(distributeNotebookSelection(even, ['a', 'b', 'c'], 'horizontal')).toBe(even)
  })

  it('treats float noise from repeating a command as no movement', () => {
    const ids = ['a', 'b', 'c']
    const page = pageOf([box('a', 10.1, 0.3, 20.7, 10.1), box('b', 47.3, 3.1, 13.9, 30.3), box('c', 90.7, 7.7, 33.3, 3.3)])
    for (const mode of ['center', 'middle', 'right', 'bottom'] as const) {
      const once = alignNotebookSelection(page, ids, mode)
      expect(alignNotebookSelection(once, ids, mode)).toBe(once)
    }
    const spread = distributeNotebookSelection(page, ids, 'horizontal')
    expect(distributeNotebookSelection(spread, ids, 'horizontal')).toBe(spread)
  })

  it('clamps a group translation inside the page', () => {
    // Ink 4 wide at the page edge: aligning to a bound left of the margin never leaves the page.
    const edge = pageOf([box('a', 2, 10, 10, 10, 'a', 4), box('b', 100, 50, 10, 10, 'b', 4)])
    const next = alignNotebookSelection(edge, ['a', 'b'], 'left')
    expect(bounds(next, 'a').x).toBeGreaterThanOrEqual(0)
    expect(bounds(next, 'b').x).toBeGreaterThanOrEqual(0)
    const tall = pageOf([box('a', 10, 10, 10, 10, 'a', 4), box('b', 100, 290, 10, 4, 'b', 20)])
    const bottom = alignNotebookSelection(tall, ['a', 'b'], 'bottom')
    for (const id of ['a', 'b']) expect(edges.bottom(bounds(bottom, id))).toBeLessThanOrEqual(300)
  })

  it('preserves unknown fields and the identity of untouched objects', () => {
    const tagged: NotebookStrokeV1 = {
      ...box('a', 50, 40, 20, 20), vendor: { keep: true },
      points: [{ x: 50, y: 40, pressure: .5, vendor: 'point' }, { x: 70, y: 60 }],
    }
    const other = box('b', 120, 100, 40, 30)
    const untouched = box('z', 5, 5, 5, 5)
    const next = alignNotebookSelection(pageOf([tagged, other, untouched]), ['a', 'b'], 'right')
    expect(next.objects[0]).toMatchObject({ vendor: { keep: true } })
    expect(next.objects[0].points[0]).toMatchObject({ pressure: .5, vendor: 'point' })
    expect(next.objects[2]).toBe(untouched)
  })
})
