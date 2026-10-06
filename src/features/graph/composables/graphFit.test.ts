import { describe, expect, it } from 'vitest'
import { computeFitCamera } from './graphFit'

function project(cam: { scale: number; tx: number; ty: number }, x: number, y: number) {
  return { x: x * cam.scale + cam.tx, y: y * cam.scale + cam.ty }
}

describe('computeFitCamera', () => {
  const spread = [
    { x: -400, y: 50 },
    { x: 700, y: -300 },
    { x: 100, y: 900 },
    { x: 350, y: 200 },
  ]

  it('keeps every node inside the viewport for phone and tablet sizes', () => {
    for (const [w, h] of [[412, 915], [800, 1280]]) {
      const cam = computeFitCamera(spread, w, h)!
      expect(cam).not.toBeNull()
      for (const p of spread) {
        const s = project(cam, p.x, p.y)
        expect(s.x).toBeGreaterThan(0)
        expect(s.x).toBeLessThan(w)
        expect(s.y).toBeGreaterThan(0)
        expect(s.y).toBeLessThan(h)
      }
    }
  })

  it('does not zoom in absurdly on a tight cluster', () => {
    const cam = computeFitCamera([{ x: 10, y: 10 }, { x: 20, y: 20 }], 412, 915)!
    expect(cam.scale).toBeLessThanOrEqual(1.5)
  })

  it('centers a single node', () => {
    const cam = computeFitCamera([{ x: 123, y: -45 }], 400, 600)!
    const s = project(cam, 123, -45)
    expect(s.x).toBeCloseTo(200)
    expect(s.y).toBeCloseTo(300)
  })

  it('ignores non-finite nodes and zero-size viewports', () => {
    expect(computeFitCamera([{ x: Number.NaN, y: 0 }], 400, 400)).toBeNull()
    expect(computeFitCamera([], 400, 400)).toBeNull()
    expect(computeFitCamera(spread, 0, 400)).toBeNull()
    const cam = computeFitCamera([{ x: Infinity, y: 0 }, { x: 5, y: 5 }], 400, 400)!
    expect(Number.isFinite(cam.tx)).toBe(true)
  })
})
