import { describe, expect, it } from 'vitest'
import { createStrokeModeler, NEVO_PARAMS, type ModeledPoint, type ModelerInput } from './index'

interface Raw {
  x: number
  y: number
  time: number
  pressure: number
}

/** Deterministic noise so the assertions are stable. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296
    return state / 4294967296 - 0.5
  }
}

function run(raw: Raw[]): { stored: ModeledPoint[]; modeler: ReturnType<typeof createStrokeModeler> } {
  const modeler = createStrokeModeler()
  const stored: ModeledPoint[] = []
  raw.forEach((p, i) => {
    const kind: ModelerInput['kind'] = i === 0 ? 'down' : i === raw.length - 1 ? 'up' : 'move'
    stored.push(...modeler.update({ kind, ...p }))
  })
  return { stored, modeler }
}

const rms = (values: number[]) => Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length)

function distanceToPolyline(p: { x: number; y: number }, line: Array<{ x: number; y: number }>): number {
  let best = Infinity
  for (let i = 0; i < line.length - 1; i += 1) {
    const a = line[i]
    const b = line[i + 1]
    const dx = b.x - a.x
    const dy = b.y - a.y
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
    best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)))
  }
  return best
}

describe('createStrokeModeler', () => {
  it('reduces the deviation of a noisy straight line', () => {
    const noise = seeded(7)
    const raw: Raw[] = Array.from({ length: 240 }, (_, i) => ({
      x: (i / 239) * 300,
      y: noise() * 3,
      time: i / 240,
      pressure: 0.5,
    }))
    const { stored } = run(raw)
    // skip the start-up transient of the spring
    const modeled = rms(stored.slice(20, -10).map((p) => p.y))
    const original = rms(raw.slice(20, -10).map((p) => p.y))
    expect(modeled).toBeLessThan(original * 0.5)
  })

  it('smooths slow jitter through the wobble smoother', () => {
    const raw: Raw[] = Array.from({ length: 60 }, (_, i) => ({
      x: 50 + (i % 2 === 0 ? 0.002 : -0.002) + i * 0.0005,
      y: 50,
      time: i / 240,
      pressure: 0.5,
    }))
    const { stored } = run(raw)
    const step = (points: Array<{ x: number }>) => rms(points.slice(1).map((p, i) => p.x - points[i].x))
    expect(step(stored.slice(10, 50))).toBeLessThan(step(raw.slice(10, 50)) * 0.5)
  })

  it('does not round a fast letter-like curve beyond the stated tolerance', () => {
    // a looped "e"-like trace, about 24 pt tall, drawn in 0.6 s (~200 pt/s)
    const count = 144
    const raw: Raw[] = Array.from({ length: count }, (_, i) => {
      const t = i / (count - 1)
      const a = t * Math.PI * 3.2
      return { x: 100 + t * 30 + 12 * Math.cos(a), y: 200 + 9 * Math.sin(a), time: (i / (count - 1)) * 0.6, pressure: 0.6 }
    })
    const { stored } = run(raw)
    const worst = Math.max(...raw.map((p) => distanceToPolyline(p, stored)))
    // the stroke follows the raw path within 0.6 pt (measured ~0.3 pt; stroke widths are typically 2-4 pt)
    expect(worst).toBeLessThan(0.6)
    // and the loop height is preserved
    const height = (pts: Array<{ y: number }>) => Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))
    expect(height(stored)).toBeGreaterThan(height(raw) * 0.9)
  })

  it('catches up with the lift point on up', () => {
    const raw: Raw[] = Array.from({ length: 60 }, (_, i) => ({ x: i * 4, y: 10 + i, time: i / 120, pressure: 0.7 }))
    const { stored, modeler } = run(raw)
    const last = raw[raw.length - 1]
    const end = stored[stored.length - 1]
    expect(Math.hypot(end.x - last.x, end.y - last.y)).toBeLessThan(0.5)
    expect(modeler.predict()).toEqual([])
  })

  it('emits at least the minimum output rate for slow input', () => {
    const modeler = createStrokeModeler()
    modeler.update({ kind: 'down', x: 0, y: 0, time: 0, pressure: 1 })
    const out = modeler.update({ kind: 'move', x: 30, y: 0, time: 0.25, pressure: 1 })
    expect(out.length).toBeGreaterThanOrEqual(Math.floor(0.25 * NEVO_PARAMS.samplingMinOutputRate))
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i].time - out[i - 1].time).toBeLessThanOrEqual(1 / NEVO_PARAMS.samplingMinOutputRate + 1e-9)
    }
  })

  it('interpolates pressure along the stroke', () => {
    const raw: Raw[] = Array.from({ length: 50 }, (_, i) => ({ x: i * 3, y: 0, time: i / 120, pressure: i / 49 }))
    const { stored } = run(raw)
    expect(stored[0].pressure).toBe(0)
    expect(stored[stored.length - 1].pressure).toBeGreaterThan(0.95)
    for (let i = 1; i < stored.length; i += 1) {
      expect(stored[i].pressure).toBeGreaterThanOrEqual(stored[i - 1].pressure - 1e-9)
      expect(stored[i].pressure).toBeLessThanOrEqual(1)
    }
    const mid = stored.find((p) => p.x >= 74)
    expect(mid && mid.pressure > 0.3 && mid.pressure < 0.7).toBe(true)
  })

  it('ignores backwards time, duplicates, non-finite values and events out of order', () => {
    const modeler = createStrokeModeler()
    expect(modeler.update({ kind: 'move', x: 1, y: 1, time: 0, pressure: 1 })).toEqual([])
    expect(modeler.update({ kind: 'down', x: 0, y: 0, time: 0, pressure: 1 })).toHaveLength(1)
    expect(modeler.update({ kind: 'move', x: 1, y: 1, time: 0.01, pressure: 1 }).length).toBeGreaterThan(0)
    expect(modeler.update({ kind: 'move', x: 1, y: 1, time: 0.01, pressure: 1 })).toEqual([])
    expect(modeler.update({ kind: 'move', x: 2, y: 2, time: 0.005, pressure: 1 })).toEqual([])
    expect(modeler.update({ kind: 'move', x: Number.NaN, y: 2, time: 0.02, pressure: 1 })).toEqual([])
    expect(modeler.update({ kind: 'move', x: 2, y: 2, time: Number.POSITIVE_INFINITY, pressure: 1 })).toEqual([])
    expect(modeler.update({ kind: 'move', x: 2, y: 2, time: 0.02, pressure: Number.NaN })).toEqual([])
    expect(modeler.update({ kind: 'move', x: 2, y: 2, time: 0.02, pressure: 1 }).length).toBeGreaterThan(0)
  })

  it('predict is empty without a stroke and never changes the model', () => {
    const modeler = createStrokeModeler()
    expect(modeler.predict()).toEqual([])
    modeler.update({ kind: 'down', x: 0, y: 0, time: 0, pressure: 1 })
    modeler.update({ kind: 'move', x: 20, y: 0, time: 0.02, pressure: 1 })
    const first = modeler.predict()
    expect(first.length).toBeGreaterThan(0)
    expect(modeler.predict()).toEqual(first)
    modeler.reset()
    expect(modeler.predict()).toEqual([])
  })

  it('can run a second stroke after the first ended', () => {
    const modeler = createStrokeModeler()
    modeler.update({ kind: 'down', x: 0, y: 0, time: 0, pressure: 1 })
    modeler.update({ kind: 'move', x: 5, y: 0, time: 0.01, pressure: 1 })
    expect(modeler.update({ kind: 'up', x: 6, y: 0, time: 0.02, pressure: 1 }).length).toBeGreaterThan(0)
    expect(modeler.update({ kind: 'down', x: 100, y: 100, time: 5, pressure: 1 })).toEqual([
      expect.objectContaining({ x: 100, y: 100 }),
    ])
  })

  it('keeps the trajectory continuous through a long pause without dropping points', () => {
    // Down and the first move share a timestamp, then the pen rests for 2.7 s before moving on:
    // restarting the model there used to drop (80, 60) and jump straight to (140, 90).
    const modeler = createStrokeModeler()
    const points: ModeledPoint[] = [
      ...modeler.update({ kind: 'down', x: 30, y: 30, time: 0, pressure: 0.5 }),
      ...modeler.update({ kind: 'move', x: 80, y: 60, time: 0, pressure: 0.5 }),
      ...modeler.update({ kind: 'move', x: 140, y: 90, time: 2.7, pressure: 0.5 }),
      ...modeler.update({ kind: 'up', x: 180, y: 100, time: 2.7, pressure: 0.5 }),
    ]
    const nearest = Math.min(...points.map(point => Math.hypot(point.x - 80, point.y - 60)))
    expect(nearest).toBeLessThan(1)
    const largestStep = Math.max(...points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y)))
    expect(largestStep).toBeLessThan(15)
    const last = points.at(-1)!
    expect(Math.hypot(last.x - 180, last.y - 100)).toBeLessThan(0.5)
  })
})
