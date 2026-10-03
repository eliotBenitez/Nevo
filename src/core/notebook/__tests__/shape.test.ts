import { describe, expect, it } from 'vitest'
import { lassoSelectNotebookObjects, notebookStrokeOutlines } from '../geometry'
import { closedNotebookStrokeOutline } from '../closedStroke'
import { createNotebook, decodeNotebook, encodeNotebook } from '../codec'
import { createNotebookExport } from '../export'
import { NOTEBOOK_SHAPE_KINDS, isNotebookShapeKind, notebookShapePoints, snapNotebookShapePoint } from '../shape'

const start = { x: 10, y: 20 }
const end = { x: 110, y: 80 }

describe('notebook shape geometry', () => {
  it.each(NOTEBOOK_SHAPE_KINDS)('exports %s as closed subpaths the PDF validator accepts', shape => {
    // The native exporter only allows a new subpath (M) at the start or right after a close (Z).
    const snapshot = createNotebook('plain')
    snapshot.pages[0].objects.push({
      id: 'shape', actionId: 'draw', kind: 'stroke', color: '#000000', width: 4, opacity: 1,
      points: notebookShapePoints([start, end], shape),
    })
    const commands = createNotebookExport(snapshot, false).pages[0].paths[0].commands
    expect(commands[0].type).toBe('M')
    expect(commands.at(-1)?.type).toBe('Z')
    commands.forEach((command, index) => {
      if (command.type === 'M' && index > 0) expect(commands[index - 1].type).toBe('Z')
    })
  })

  it.each(['rectangle', 'triangle'] as const)('renders %s vertices without freehand smoothing and preserves stored points', shape => {
    const points = notebookShapePoints([start, end], shape)
    const snapshot = createNotebook('plain')
    snapshot.pages[0].objects.push({ id: 'shape', actionId: 'draw', kind: 'stroke', color: '#000000', width: 4, opacity: 1, points, vendor: { keep: true } })
    const original = encodeNotebook(snapshot)
    const outlines = notebookStrokeOutlines(points, 4)
    expect(outlines[0].filter(command => command.type === 'M')).toHaveLength(2)
    expect(outlines[0].filter(command => command.type === 'Z')).toHaveLength(2)
    expect(outlines[0].some(command => command.type === 'Q')).toBe(false)
    const decoded = decodeNotebook(JSON.parse(original))
    expect(decoded.status).toBe('valid')
    if (decoded.status === 'valid') {
      expect(createNotebookExport(decoded.snapshot, false).pages[0].paths[0].commands).toEqual(outlines[0])
      expect(encodeNotebook(decoded.snapshot)).toBe(original)
    }
  })

  it('keeps rectangle sides at the requested constant width', () => {
    const outline = notebookStrokeOutlines(notebookShapePoints([start, end], 'rectangle'), 4)[0]
    const corners = outline.filter(command => command.type === 'M' || command.type === 'L')
    expect(corners.map(command => [command.x, command.y])).toEqual([
      [8, 18], [112, 18], [112, 82], [8, 82],
      [12, 78], [108, 78], [108, 22], [12, 22],
    ])
  })

  it('selects the rendered rectangle corner but leaves its empty interior unselected', () => {
    const object = { id: 'rectangle', actionId: 'draw', kind: 'stroke' as const, color: '#000000', width: 4, opacity: 1,
      points: notebookShapePoints([start, end], 'rectangle') }
    expect(lassoSelectNotebookObjects([object], [{ x: 8, y: 18 }, { x: 9, y: 18 }, { x: 9, y: 19 }, { x: 8, y: 19 }])).toEqual(['rectangle'])
    expect(lassoSelectNotebookObjects([object], [{ x: 50, y: 40 }, { x: 60, y: 40 }, { x: 60, y: 50 }, { x: 50, y: 50 }])).toEqual([])
  })

  it('handles tiny and reversed loops without inverted holes or non-finite coordinates', () => {
    for (const shape of NOTEBOOK_SHAPE_KINDS) {
      const points = notebookShapePoints([{ x: 3, y: 3 }, { x: 1, y: 1 }], shape)
      for (const loop of [points, [...points].reverse()]) {
        const outline = closedNotebookStrokeOutline(loop, 8)!
        expect(outline.filter(command => command.type === 'Z')).toHaveLength(1)
        expect(outline.every(command => command.type === 'Z' || ('x' in command && Number.isFinite(command.x) && Number.isFinite(command.y)))).toBe(true)
      }
    }
    expect(closedNotebookStrokeOutline([{ x: 0, y: 0 }, { x: 1, y: 1 }], 2)).toBeNull()
    const pressured = notebookShapePoints([start, end], 'triangle')
    pressured[1].pressure = 1
    expect(closedNotebookStrokeOutline(pressured, 2)).toBeNull()
    const longLoop = Array.from({ length: 128 }, (_, index) => ({ x: Math.cos(index * Math.PI / 64), y: Math.sin(index * Math.PI / 64), pressure: 0.5 }))
    longLoop.push(longLoop[0])
    expect(closedNotebookStrokeOutline(longLoop, 2)).toBeNull()
  })

  it('builds a closed rectangle from the gesture box using the four corners', () => {
    const points = notebookShapePoints([start, { x: 50, y: 50 }, end], 'rectangle')
    expect(points.length).toBe(5)
    expect(points.at(-1)).toEqual(points[0])
    expect(points).toEqual([
      { x: 10, y: 20, pressure: 0.5 },
      { x: 110, y: 20, pressure: 0.5 },
      { x: 110, y: 80, pressure: 0.5 },
      { x: 10, y: 80, pressure: 0.5 },
      { x: 10, y: 20, pressure: 0.5 },
    ])
  })

  it('draws a triangle with its apex centred on the top edge', () => {
    const points = notebookShapePoints([start, end], 'triangle')
    expect(points).toEqual([
      { x: 60, y: 20, pressure: 0.5 },
      { x: 110, y: 80, pressure: 0.5 },
      { x: 10, y: 80, pressure: 0.5 },
      { x: 60, y: 20, pressure: 0.5 },
    ])
  })

  it('samples a closed ellipse that stays inside the draggable box', () => {
    const points = notebookShapePoints([start, end], 'ellipse')
    expect(points.length).toBeGreaterThan(16)
    expect(points.at(-1)).toEqual(points[0])
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(10 - 1e-9)
      expect(point.x).toBeLessThanOrEqual(110 + 1e-9)
      expect(point.y).toBeGreaterThanOrEqual(20 - 1e-9)
      expect(point.y).toBeLessThanOrEqual(80 + 1e-9)
      expect(point.pressure).toBe(0.5)
    }
    expect(new Set(points.map(point => point.y)).size).toBeGreaterThan(2)
  })

  it('forces a circle to a square box anchored at the start even without shift', () => {
    const points = notebookShapePoints([start, { x: 210, y: 30 }], 'circle')
    const xs = points.map(point => point.x)
    const ys = points.map(point => point.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 6)
    expect(Math.min(...xs)).toBe(10)
    expect(Math.min(...ys)).toBe(20)
    expect(points.at(-1)).toEqual(points[0])
  })

  it('rejects missing, non-finite, and degenerate gestures', () => {
    expect(notebookShapePoints([start], 'rectangle')).toEqual([])
    expect(notebookShapePoints([start, { ...start }], 'rectangle')).toEqual([])
    expect(notebookShapePoints([start, { x: Number.NaN, y: 20 }], 'ellipse')).toEqual([])
    expect(notebookShapePoints([start, { x: 10.2, y: 20.2 }], 'triangle')).toEqual([])
  })

  it('snaps a shape endpoint to a square while preserving the drag direction', () => {
    expect(snapNotebookShapePoint({ x: 0, y: 0 }, { x: 100, y: 30 })).toEqual({ x: 100, y: 100 })
    expect(snapNotebookShapePoint({ x: 0, y: 0 }, { x: -40, y: 90 })).toMatchObject({ x: -90, y: 90 })
    expect(snapNotebookShapePoint({ x: 0, y: 0 }, { x: Number.NaN, y: 10 })).toEqual({ x: Number.NaN, y: 10 })
  })

  it('recognises shape tools and renders each as one closed outline', () => {
    for (const shape of NOTEBOOK_SHAPE_KINDS) expect(isNotebookShapeKind(shape)).toBe(true)
    expect(isNotebookShapeKind('pen')).toBe(false)
    expect(isNotebookShapeKind('line')).toBe(false)
    for (const shape of NOTEBOOK_SHAPE_KINDS) {
      const outlines = notebookStrokeOutlines(notebookShapePoints([start, end], shape), 3, false)
      expect(outlines).toHaveLength(1)
      expect(outlines[0][0]).toMatchObject({ type: 'M' })
      expect(outlines[0].at(-1)).toEqual({ type: 'Z' })
    }
  })
})
