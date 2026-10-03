import { describe, expect, it } from 'vitest'
import { notebookLineEndpoints, notebookLineSegments, snapNotebookAngle } from '../line'
import { notebookStrokeOutlines } from '../geometry'
import type { NotebookLineStyle } from '../types'

const start = { x: 10, y: 20 }
const end = { x: 110, y: 20 }

describe('notebook line geometry', () => {
  it('normalizes a straight gesture to two flat endpoints with a stable pressure', () => {
    const points = [start, { x: 40, y: 30 }, end]
    expect(notebookLineEndpoints(points)).toEqual([
      { x: 10, y: 20, pressure: 0.5 },
      { x: 110, y: 20, pressure: 0.5 },
    ])
    expect(notebookLineEndpoints([start])).toBeNull()
    expect(notebookLineEndpoints([start, { x: NaN, y: 20 }])).toBeNull()
  })

  it('exports a single solid segment that reuses the shared stroke outline', () => {
    const segments = notebookLineSegments([start, { x: 60, y: 20 }, end], 2, 'solid')
    expect(segments).toEqual([[{ x: 10, y: 20, pressure: 0.5 }, { x: 110, y: 20, pressure: 0.5 }]])
    expect(notebookStrokeOutlines(notebookLineEndpoints([start, end])!, 2, false, 'solid')).toHaveLength(1)
  })

  it('splits a dashed line into ordered segments with a width-aware gap', () => {
    const segments = notebookLineSegments([start, { x: 40, y: 60 }, end], 4, 'dashed')
    expect(segments.length).toBeGreaterThan(1)
    expect(segments[0][0]).toMatchObject({ x: 10, y: 20 })
    for (const [from, to] of segments) {
      expect(from.x).toBeLessThanOrEqual(to.x)
      expect(from.y).toBe(20)
      expect(to.y).toBe(20)
    }
    const lastEnd = segments[segments.length - 1][1]
    const gap = segments[1][0].x - segments[0][1].x
    expect(gap).toBeGreaterThan(0)
    expect(lastEnd.x).toBeLessThanOrEqual(110)
    expect(segments.every(segment => segment.length === 2)).toBe(true)
  })

  it('renders a dotted line as spaced single-point dots that stay inside the endpoints', () => {
    const segments = notebookLineSegments([start, end], 4, 'dotted')
    expect(segments.length).toBeGreaterThan(1)
    expect(segments.every(segment => segment.length === 1)).toBe(true)
    expect(segments[0][0]).toMatchObject({ x: 10, y: 20, pressure: 0.5 })
    const spacing = segments[1][0].x - segments[0][0].x
    expect(spacing).toBeGreaterThanOrEqual(4)
    expect(segments[segments.length - 1][0].x).toBeLessThanOrEqual(110)
  })

  it('expands dashed and dotted strokes to one closed outline per mark for the shared renderer', () => {
    for (const dash of ['dashed', 'dotted'] as const) {
      const outlines = notebookStrokeOutlines([start, end], 4, false, dash)
      expect(outlines.length).toBeGreaterThan(1)
      for (const outline of outlines) {
        expect(outline[0]).toMatchObject({ type: 'M' })
        expect(outline.at(-1)).toEqual({ type: 'Z' })
      }
    }
    expect(notebookStrokeOutlines([start, end], 4, false, 'solid' as NotebookLineStyle)).toHaveLength(1)
    expect(notebookStrokeOutlines([start], 4, false, 'dashed')).toEqual([])
  })

  it('snaps the endpoint to the nearest fifteen degrees while preserving length', () => {
    const length = 100
    const snapped = snapNotebookAngle({ x: 0, y: 0 }, { x: Math.cos(Math.PI / 9) * length, y: Math.sin(Math.PI / 9) * length })
    expect(Math.atan2(snapped.y, snapped.x)).toBeCloseTo(Math.PI / 12, 6)
    expect(Math.hypot(snapped.x, snapped.y)).toBeCloseTo(length, 6)

    expect(snapNotebookAngle({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 })
    expect(snapNotebookAngle({ x: 0, y: 0 }, { x: 10, y: 0 })).toMatchObject({ x: 10, y: 0 })
  })
})
