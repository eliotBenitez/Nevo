import { describe, expect, it } from 'vitest'
import {
  eraseNotebookStroke,
  eraseWholeNotebookStrokes,
  lassoSelectNotebookObjects,
  notebookStrokeOutline,
} from '../geometry'
import type { NotebookStrokeV1 } from '../types'

const line: NotebookStrokeV1 = {
  id: 'line', kind: 'stroke', actionId: 'ink', color: '#000000', width: 8, opacity: 1,
  strokeVendor: { kept: true },
  points: [
    { x: 0, y: 50, pressure: 0, pointVendor: { kept: true } },
    { x: 100, y: 50, pressure: 1, pointVendor: { kept: true } },
  ],
}

describe('notebook geometry', () => {
  it('renders a one-point stroke, including explicit zero pressure, as a visible outline', () => {
    const outline = notebookStrokeOutline([{ x: 20, y: 30, pressure: 0 }], 8)
    expect(outline.length).toBeGreaterThan(2)
    expect(outline[0]).toMatchObject({ type: 'M' })
    expect(outline.at(-1)).toEqual({ type: 'Z' })
  })

  it('splits strokes under a pressure-aware eraser and preserves source metadata', () => {
    let counter = 0
    const pieces = eraseNotebookStroke(line, [{ x: 50, y: 0 }, { x: 50, y: 100 }], 6, () => `piece-${++counter}`)
    expect(pieces).toHaveLength(2)
    expect(pieces.map(piece => piece.id)).toEqual(['piece-1', 'piece-2'])
    expect(pieces.every(piece => piece.actionId === 'ink' && piece.strokeVendor !== undefined
      && piece.points.every(point => point.pointVendor !== undefined))).toBe(true)
  })

  it('selects a stroke when the lasso crosses its actual outline', () => {
    const lasso = [{ x: 48, y: 45 }, { x: 52, y: 45 }, { x: 52, y: 55 }, { x: 48, y: 55 }]
    expect(lassoSelectNotebookObjects([line], lasso)).toEqual(['line'])
    expect(lassoSelectNotebookObjects([line], [
      { x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 },
    ])).toEqual([])
  })

  it('uses explicit pressure for pen outlines while keeping the marker width constant', () => {
    const low = notebookStrokeOutline([{ x: 0, y: 0, pressure: 0 }, { x: 20, y: 0, pressure: 0 }], 8)
    const high = notebookStrokeOutline([{ x: 0, y: 0, pressure: 1 }, { x: 20, y: 0, pressure: 1 }], 8)
    const markerLow = notebookStrokeOutline([{ x: 0, y: 0, pressure: 0 }, { x: 20, y: 0, pressure: 0 }], 8, true)
    const markerHigh = notebookStrokeOutline([{ x: 0, y: 0, pressure: 1 }, { x: 20, y: 0, pressure: 1 }], 8, true)
    expect(Math.max(...high.map(point => point.type === 'Z' ? 0 : point.type === 'Q' ? point.cy : point.y))
      - Math.min(...high.map(point => point.type === 'Z' ? 0 : point.type === 'Q' ? point.cy : point.y)))
      .toBeGreaterThan(Math.max(...low.map(point => point.type === 'Z' ? 0 : point.type === 'Q' ? point.cy : point.y))
        - Math.min(...low.map(point => point.type === 'Z' ? 0 : point.type === 'Q' ? point.cy : point.y)))
    expect(markerLow).toEqual(markerHigh)
  })
})

describe('eraseWholeNotebookStrokes', () => {
  const stroke = (id: string, actionId: string, points: [number, number][], width = 2): NotebookStrokeV1 => ({
    id, actionId, kind: 'stroke', color: '#000000', width, opacity: 1, points: points.map(([x, y]) => ({ x, y, pressure: 0.5 })),
  })
  const rectangle = stroke('rect', 'a-rect', [[0, 0], [200, 0], [200, 100], [0, 100], [0, 0]])
  const far = stroke('far', 'a-far', [[0, 400], [50, 420]])
  const pt = (x: number, y: number) => ({ x, y, pressure: 0.5 })

  it('removes a long edge crossed far from any stored vertex', () => {
    expect(eraseWholeNotebookStrokes([rectangle, far], [pt(100, -20), pt(100, 20)], 4)).toEqual([far])
  })

  it('keeps identical objects when the eraser misses', () => {
    const result = eraseWholeNotebookStrokes([rectangle, far], [pt(100, 50), pt(120, 60)], 4)
    expect(result).toHaveLength(2)
    expect(result[0]).toBe(rectangle)
    expect(result[1]).toBe(far)
  })

  it('removes every object sharing the hit actionId', () => {
    const head = stroke('head', 'arrow', [[500, 500], [510, 520]])
    const shaft = stroke('shaft', 'arrow', [[0, 300], [100, 300]])
    const result = eraseWholeNotebookStrokes([head, shaft, far], [pt(50, 295), pt(50, 305)], 2)
    expect(result).toEqual([far])
  })

  it('erases a dot with a tap and ignores dots out of reach', () => {
    const dot = stroke('dot', 'dot', [[30, 30]], 4)
    const other = stroke('other', 'other', [[300, 300]], 4)
    const result = eraseWholeNotebookStrokes([dot, other], [pt(34, 30)], 3)
    expect(result).toEqual([other])
    expect(result[0]).toBe(other)
  })
})
