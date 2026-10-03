import { describe, expect, it } from 'vitest'
import { NOTEBOOK_RECOGNITION_MIN_SIZE, recognizeNotebookShape } from './recognize'
import type { NotebookPointV1 } from './types'

const p = (x: number, y: number): NotebookPointV1 => ({ x, y, pressure: 0.3 })
const wobble = (i: number, amount = 1.5) => Math.sin(i * 12.9898) * amount

function walk(corners: [number, number][], perSide = 20, noise = 0): NotebookPointV1[] {
  const out: NotebookPointV1[] = []
  let i = 0
  corners.forEach(([x1, y1], index) => {
    const [x2, y2] = corners[(index + 1) % corners.length]
    for (let step = 0; step < perSide; step += 1) {
      const t = step / perSide
      out.push(p(x1 + (x2 - x1) * t + wobble(i, noise), y1 + (y2 - y1) * t + wobble(i + 0.5, noise)))
      i += 1
    }
  })
  return out
}

function ellipse(cx: number, cy: number, rx: number, ry: number, count = 80, noise = 0): NotebookPointV1[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const a = (i / count) * Math.PI * 2
    return p(cx + Math.cos(a) * rx + wobble(i, noise), cy + Math.sin(a) * ry + wobble(i + 0.5, noise))
  })
}

describe('recognizeNotebookShape', () => {
  it('recognizes a straight line and a wobbly line', () => {
    const straight = Array.from({ length: 20 }, (_, i) => p(10 + i * 10, 20 + i * 5))
    expect(recognizeNotebookShape(straight)?.shape).toBe('line')
    const result = recognizeNotebookShape(straight.map((point, i) => ({ ...point, y: point.y + wobble(i, 2) })))
    expect(result?.shape).toBe('line')
    expect(result?.points).toHaveLength(2)
    expect(result?.points.every(point => point.pressure === 0.5)).toBe(true)
  })

  it('recognizes a noisy rectangle whose ends overlap as an axis-aligned rectangle', () => {
    const points = [...walk([[20, 20], [220, 20], [220, 120], [20, 120]], 25, 1.5), p(26, 21), p(34, 19)]
    const result = recognizeNotebookShape(points)
    expect(result?.shape).toBe('rectangle')
    expect(result?.points).toHaveLength(5)
    expect(result?.points[0]).toEqual(result?.points[4])
  })

  it('ignores a long overshoot past the start of a closed shape', () => {
    const square = [...walk([[20, 20], [220, 20], [220, 220], [20, 220]], 25, 1.5),
      ...Array.from({ length: 12 }, (_, i) => p(20 + i * 5, 20 + wobble(i, 1)))]
    expect(recognizeNotebookShape(square)?.shape).toBe('rectangle')
    const circle = [...ellipse(100, 100, 60, 60, 80, 1), ...ellipse(100, 100, 60, 60, 80, 1).slice(1, 18)]
    expect(recognizeNotebookShape(circle)?.shape).toBe('circle')
  })

  it('recognizes a rotated square as a quadrilateral', () => {
    const result = recognizeNotebookShape(walk([[100, 20], [180, 100], [100, 180], [20, 100]], 25, 1))
    expect(result?.shape).toBe('quadrilateral')
    expect(result?.points).toHaveLength(5)
    expect(result?.points[0]).toEqual(result?.points[4])
  })

  it('recognizes a triangle', () => {
    const result = recognizeNotebookShape(walk([[100, 20], [200, 160], [20, 160]], 30, 1))
    expect(result?.shape).toBe('triangle')
    expect(result?.points).toHaveLength(4)
    expect(result?.points[0]).toEqual(result?.points[3])
  })

  it('recognizes circles and wide ellipses', () => {
    const circle = recognizeNotebookShape(ellipse(100, 100, 50, 52, 80, 1))
    expect(circle?.shape).toBe('circle')
    expect(circle?.points[0]).toEqual(circle?.points[circle.points.length - 1])
    expect(recognizeNotebookShape(ellipse(150, 80, 100, 40, 100, 1))?.shape).toBe('ellipse')
  })

  it('uses a uniform pressure for every recognized point', () => {
    const result = recognizeNotebookShape(ellipse(100, 100, 50, 50))
    expect(result?.points.every(point => point.pressure === 0.5)).toBe(true)
  })

  it('rejects scribbles, open arcs, tiny gestures, and non-finite input', () => {
    const zigzag = Array.from({ length: 30 }, (_, i) => p(10 + i * 8, i % 2 ? 80 : 20))
    expect(recognizeNotebookShape(zigzag)).toBeNull()
    const arc = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 39) * Math.PI
      return p(100 + Math.cos(a) * 60, 100 + Math.sin(a) * 60)
    })
    expect(recognizeNotebookShape(arc)).toBeNull()
    expect(recognizeNotebookShape([p(0, 0), p(NOTEBOOK_RECOGNITION_MIN_SIZE / 4, 0)])).toBeNull()
    expect(recognizeNotebookShape([p(0, 0)])).toBeNull()
    expect(recognizeNotebookShape([p(0, 0), p(Number.NaN, 5), p(50, 50)])).toBeNull()
  })
})
