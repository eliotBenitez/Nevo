import { describe, expect, it } from 'vitest'
import { notebookArrowSegments } from '../arrow'
import { notebookStrokeOutline } from '../geometry'

describe('notebook arrow geometry', () => {
  it('renders every segment through the shared tip without shortening the shaft', () => {
    const parts = notebookArrowSegments([{ x: 10, y: 20 }, { x: 110, y: 20 }], 2)
    for (const points of parts) {
      const outline = notebookStrokeOutline(points, 2)
      const xs = outline.flatMap(command => command.type === 'Z' ? []
        : command.type === 'Q' ? [command.cx, command.x] : [command.x])
      expect(Math.max(...xs)).toBeGreaterThanOrEqual(110)
    }
  })

  it('uses the first and last samples for a straight shaft and two symmetric head arms', () => {
    const parts = notebookArrowSegments([{ x: 10, y: 20 }, { x: 30, y: 70 }, { x: 110, y: 20 }], 2)
    expect(parts).toHaveLength(3)
    expect(parts[0]).toEqual([{ x: 10, y: 20, pressure: 0.5 }, { x: 110, y: 20, pressure: 0.5 }])
    expect(parts[1][1]).toEqual(parts[0][1])
    expect(parts[2][1]).toEqual(parts[0][1])
    expect(parts[1][0].x).toBeLessThan(110)
    expect(parts[1][0].x).toBe(parts[2][0].x)
    expect(parts[1][0].y - 20).toBeCloseTo(20 - parts[2][0].y)
  })

  it('bounds the head for short reversed and vertical arrows and ignores degenerate gestures', () => {
    for (const end of [{ x: -4, y: 0 }, { x: 0, y: 4 }]) {
      const parts = notebookArrowSegments([{ x: 0, y: 0 }, end], 8)
      expect(parts).toHaveLength(3)
      expect(parts.flat().every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true)
      expect(Math.hypot(parts[1][0].x - end.x, parts[1][0].y - end.y)).toBeLessThan(4)
    }
    expect(notebookArrowSegments([{ x: 0, y: 0 }], 2)).toEqual([])
    expect(notebookArrowSegments([{ x: 0, y: 0 }, { x: 0, y: 0 }], 2)).toEqual([])
    expect(notebookArrowSegments([{ x: 0, y: 0 }, { x: NaN, y: 4 }], 2)).toEqual([])
  })
})
