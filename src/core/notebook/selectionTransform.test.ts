import { describe, expect, it } from 'vitest'
import { createNotebook, decodeNotebook, encodeNotebook } from './codec'
import { flipNotebookSelection, notebookSelectionBounds, transformNotebookSelection } from './selectionTransform'
import { notebookImageMatrix } from './image'
import type { NotebookImageV1, NotebookStrokeV1 } from './types'

const stroke: NotebookStrokeV1 = {
  id: 'ink', actionId: 'action', kind: 'stroke', color: '#123456', width: 2, opacity: 1,
  dash: 'dashed', vendor: { keep: true },
  points: [{ x: 100, y: 100, pressure: .3, vendor: 'point' }, { x: 200, y: 100, pressure: .7 }],
}

describe('notebook selection transforms', () => {
  it('scales uniformly and rotates around the shared center without dropping fields', () => {
    const page = { ...createNotebook().pages[0], objects: [stroke] }
    const scaled = transformNotebookSelection(page, ['ink'], { scale: 2 })
    expect(scaled.objects[0].points.map(p => [p.x, p.y])).toEqual([[50, 100], [250, 100]])
    expect(scaled.objects[0].width).toBe(4)
    const turned = transformNotebookSelection(page, ['ink'], { angle: 90 })
    expect(turned.objects[0].points[0].x).toBeCloseTo(150)
    expect(turned.objects[0].points[0].y).toBeCloseTo(50)
    expect(turned.objects[0].points[1].y).toBeCloseTo(150)
    expect(turned.objects[0]).toMatchObject({ vendor: { keep: true }, dash: 'dashed', actionId: 'action' })
    expect(turned.objects[0].points[0]).toMatchObject({ pressure: .3, vendor: 'point' })
    expect(page.objects[0]).toBe(stroke)
  })

  it('fits a whole group on the page without clamping individual vertices', () => {
    const page = { ...createNotebook().pages[0], objects: [stroke] }
    const next = transformNotebookSelection(page, ['ink'], { scale: 20, angle: 30, dx: 900, dy: -900 })
    const bounds = notebookSelectionBounds(next.objects)!
    expect(bounds.x).toBeGreaterThanOrEqual(-1e-8)
    expect(bounds.y).toBeGreaterThanOrEqual(-1e-8)
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.width + 1e-8)
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(page.height + 1e-8)
    const [a, b] = next.objects[0].points
    expect(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI).toBeCloseTo(30)
    expect(decodeNotebook(encodeNotebook({ version: 1, pages: [next] })).status).toBe('valid')
  })

  it('keeps pen and marker widths valid at either scale extreme', () => {
    const marker = { ...stroke, id: 'marker', kind: 'highlighter' as const, width: 24, opacity: .25 }
    const page = { ...createNotebook().pages[0], objects: [stroke, marker] }
    for (const scale of [.05, 20]) {
      const next = transformNotebookSelection(page, ['ink', 'marker'], { scale })
      expect(decodeNotebook(encodeNotebook({ version: 1, pages: [next] })).status).toBe('valid')
      expect(next.objects[1].opacity).toBe(.25)
    }
  })

  it('rejects invalid and empty operations and leaves unselected objects identical', () => {
    const other = { ...stroke, id: 'other' }
    const page = { ...createNotebook().pages[0], objects: [stroke, other] }
    for (const transform of [{ scale: NaN }, { angle: Infinity }, { scale: 0 }, {}]) {
      expect(transformNotebookSelection(page, ['ink'], transform)).toBe(page)
    }
    expect(transformNotebookSelection(page, [], { scale: 2 })).toBe(page)
    expect(transformNotebookSelection(page, ['ink'], { scale: 2 }).objects[1]).toBe(other)
  })

  it('does not create an edit when translation is blocked at a page edge', () => {
    const edge = { ...stroke, points: [{ x: 1, y: 30 }, { x: 1, y: 50 }] }
    const page = { ...createNotebook().pages[0], objects: [edge] }
    expect(transformNotebookSelection(page, ['ink'], { dx: -10 })).toBe(page)
  })

  it('flips the selection through the center of its bounds and keeps everything else', () => {
    const arrowHead: NotebookStrokeV1 = { ...stroke, id: 'head', points: [{ x: 190, y: 90 }, { x: 200, y: 100 }] }
    const other: NotebookStrokeV1 = { ...stroke, id: 'other', actionId: 'other', points: [{ x: 10, y: 10 }, { x: 20, y: 30 }] }
    const page = { ...createNotebook().pages[0], objects: [stroke, arrowHead, other] }
    const before = notebookSelectionBounds([stroke, arrowHead])!

    const horizontal = flipNotebookSelection(page, ['ink', 'head'], 'horizontal')
    expect(horizontal.objects[0].points.map(p => [p.x, p.y])).toEqual([[200, 100], [100, 100]])
    expect(horizontal.objects[1].points.map(p => [p.x, p.y])).toEqual([[110, 90], [100, 100]])
    expect(notebookSelectionBounds(horizontal.objects.slice(0, 2))).toEqual(before)
    expect(horizontal.objects[2]).toBe(other)
    expect(horizontal.objects[0]).toMatchObject({ vendor: { keep: true }, dash: 'dashed', width: 2 })
    expect(horizontal.objects[0].points[0]).toMatchObject({ pressure: .3, vendor: 'point' })

    const vertical = flipNotebookSelection(page, ['head'], 'vertical')
    expect(vertical.objects[1].points.map(p => [p.x, p.y])).toEqual([[190, 100], [200, 90]])
    expect(flipNotebookSelection(flipNotebookSelection(page, ['ink', 'head'], 'vertical'), ['ink', 'head'], 'vertical').objects
      .slice(0, 2).flatMap(object => object.points.map(p => [p.x, p.y])))
      .toEqual([[100, 100], [200, 100], [190, 90], [200, 100]])
    expect(flipNotebookSelection(page, [], 'horizontal')).toBe(page)
  })

  it('mirrors image content and keeps the notebook valid', () => {
    const image: NotebookImageV1 = {
      id: 'img', actionId: 'img', kind: 'image', src: '.nevo/assets/a.png', opacity: 1,
      points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 100, y: 200 }],
    }
    const notebook = createNotebook()
    notebook.pages[0] = { ...notebook.pages[0], objects: [image] }
    const flipped = flipNotebookSelection(notebook.pages[0], ['img'], 'horizontal')
    const [a, b, c, d] = notebookImageMatrix(flipped.objects[0].points)
    expect(a * d - b * c).toBeLessThan(0)
    expect(notebookSelectionBounds(flipped.objects)).toEqual(notebookSelectionBounds([image]))
    expect(decodeNotebook(encodeNotebook({ ...notebook, pages: [flipped] })).status).toBe('valid')
  })
})
