/*
 * Test vectors ported from the unit tests of ink-stroke-modeler-rs
 * (MIT OR Apache-2.0) and google/ink-stroke-modeler (Apache-2.0).
 * See NOTICE.txt in this directory.
 */
import { describe, expect, it } from 'vitest'
import { modelEndOfStroke } from './endOfStroke'
import { StrokeModelerEngine } from './engine'
import { dist, interp, interp2, nearestPointOnSegment, normalize01 } from './math'
import { SUGGESTED_PARAMS, validateParams } from './params'
import { PositionModeler, type ModelerState } from './positionModeler'
import { updateAlongLinearPath } from './resampler'
import { StylusStateModeler } from './stylusStateModeler'
import { WobbleSmoother } from './wobbleSmoother'

const config = {
  springMassConstant: SUGGESTED_PARAMS.positionModelerSpringMassConstant,
  dragConstant: SUGGESTED_PARAMS.positionModelerDragConstant,
}

type Expected = { pos: [number, number]; velocity: [number, number]; acceleration: [number, number]; time: number }

function expectNear(actual: ModelerState, expected: Expected, tol = 0.005) {
  expect(Math.abs(actual.pos.x - expected.pos[0])).toBeLessThanOrEqual(tol)
  expect(Math.abs(actual.pos.y - expected.pos[1])).toBeLessThanOrEqual(tol)
  expect(Math.abs(actual.velocity.x - expected.velocity[0])).toBeLessThanOrEqual(tol)
  expect(Math.abs(actual.velocity.y - expected.velocity[1])).toBeLessThanOrEqual(tol)
  expect(Math.abs(actual.acceleration.x - expected.acceleration[0])).toBeLessThanOrEqual(tol)
  expect(Math.abs(actual.acceleration.y - expected.acceleration[1])).toBeLessThanOrEqual(tol)
  expect(Math.abs(actual.time - expected.time)).toBeLessThanOrEqual(tol)
}

describe('math helpers', () => {
  it('normalize01', () => {
    expect(normalize01(1, 2, 1.5)).toBeCloseTo(0.5)
    expect(normalize01(7, 3, 4)).toBeCloseTo(0.75)
    expect(normalize01(-1, 1, 2)).toBe(1)
    expect(normalize01(1, 1, 1)).toBe(0)
    expect(normalize01(1, 1, 0)).toBe(0)
    expect(normalize01(1, 1, 2)).toBe(1)
  })

  it('interp clamps the amount', () => {
    expect(interp(5, 10, 0.2)).toBeCloseTo(6)
    expect(interp(10, -2, 0.75)).toBeCloseTo(1)
    expect(interp(-1, 2, -3)).toBe(-1)
    expect(interp(5, 7, 20)).toBe(7)
    expect(interp2({ x: 1, y: 2 }, { x: 3, y: 5 }, 0.5)).toEqual({ x: 2, y: 3.5 })
    expect(interp2({ x: -5, y: 5 }, { x: -15, y: 0 }, 0.4)).toEqual({ x: -9, y: 3 })
    expect(interp2({ x: 12, y: 5 }, { x: 13, y: 14 }, 3.2)).toEqual({ x: 13, y: 14 })
  })

  it('nearestPointOnSegment', () => {
    const p = (x: number, y: number) => ({ x, y })
    expect(nearestPointOnSegment(p(0, 0), p(1, 0), p(0.25, 0.5))).toBe(0.25)
    expect(nearestPointOnSegment(p(3, 4), p(5, 6), p(-1, -1))).toBe(0)
    expect(nearestPointOnSegment(p(20, 10), p(10, 5), p(2, 2))).toBe(1)
    expect(nearestPointOnSegment(p(0, 5), p(5, 0), p(3, 3))).toBe(0.5)
    expect(nearestPointOnSegment(p(0, 0), p(0, 0), p(5, 10))).toBe(0)
    expect(dist(p(0, 0), p(3, 4))).toBe(5)
  })
})

describe('params', () => {
  it('suggested values are valid', () => {
    expect(validateParams(SUGGESTED_PARAMS)).toEqual([])
  })

  it('rejects invalid values', () => {
    expect(
      validateParams({
        wobbleSmootherTimeout: -1,
        wobbleSmootherSpeedFloor: -1,
        wobbleSmootherSpeedCeiling: -1,
        positionModelerSpringMassConstant: -1,
        positionModelerDragConstant: -1,
        samplingMinOutputRate: -1,
        samplingEndOfStrokeStoppingDistance: -1,
        samplingEndOfStrokeMaxIterations: 0,
        samplingMaxOutputsPerCall: 0,
        stylusStateModelerMaxInputSamples: 0,
      }).length,
    ).toBeGreaterThan(0)
    expect(validateParams({ ...SUGGESTED_PARAMS, wobbleSmootherSpeedFloor: 2 })).not.toEqual([])
    expect(validateParams({ ...SUGGESTED_PARAMS, samplingMinOutputRate: Number.NaN })).not.toEqual([])
  })
})

describe('wobble smoother (upstream vectors)', () => {
  const near = (a: { x: number; y: number }, x: number, y: number) => {
    expect(a.x).toBeCloseTo(x, 4)
    expect(a.y).toBeCloseTo(y, 4)
  }
  const make = () =>
    new WobbleSmoother({
      timeout: SUGGESTED_PARAMS.wobbleSmootherTimeout,
      speedFloor: SUGGESTED_PARAMS.wobbleSmootherSpeedFloor,
      speedCeiling: SUGGESTED_PARAMS.wobbleSmootherSpeedCeiling,
    })

  it('smooths a slow line', () => {
    const w = make()
    w.update({ x: 3, y: 4 }, 1.0)
    near(w.update({ x: 3.016, y: 4 }, 1.016), 3.016, 4)
    near(w.update({ x: 3.032, y: 4 }, 1.032), 3.024, 4)
    near(w.update({ x: 3.048, y: 4 }, 1.048), 3.032, 4)
    near(w.update({ x: 3.064, y: 4 }, 1.064), 3.048, 4)
  })

  it('smooths a slow zigzag', () => {
    const w = make()
    w.update({ x: 1, y: 2 }, 5.0)
    near(w.update({ x: 1.016, y: 2 }, 5.016), 1.016, 2)
    near(w.update({ x: 1.016, y: 2.016 }, 5.032), 1.016, 2.008)
    near(w.update({ x: 1.032, y: 2.016 }, 5.048), 1.02133, 2.01067)
    near(w.update({ x: 1.032, y: 2.032 }, 5.064), 1.0266667, 2.0213333)
    near(w.update({ x: 1.048, y: 2.032 }, 5.08), 1.0373333, 2.0266667)
    near(w.update({ x: 1.048, y: 2.048 }, 5.096), 1.0426667, 2.0373333)
  })

  it('leaves a fast zigzag untouched', () => {
    const w = make()
    near(w.update({ x: 7, y: 3.024 }, 8.016), 7, 3.024)
    near(w.update({ x: 7.024, y: 3.024 }, 8.032), 7.024, 3.024)
    near(w.update({ x: 7.024, y: 3.048 }, 8.048), 7.024, 3.048)
    near(w.update({ x: 7.048, y: 3.048 }, 8.064), 7.048, 3.048)
  })
})

describe('position modeler (upstream vectors)', () => {
  const dt = 1 / 180

  it('straight line', () => {
    const m = new PositionModeler(config, { pos: { x: 0, y: 0 }, time: 0 })
    let t = 0
    const cases: Array<[number, Expected['pos'], Expected['velocity'], Expected['acceleration']]> = [
      [1, [0.0909, 0], [16.3636, 0], [2945.4546, 0]],
      [2, [0.319, 0], [41.0579, 0], [4444.959, 0]],
      [3, [0.6996, 0], [68.5055, 0], [4940.5737, 0]],
      [4, [1.228, 0], [95.1099, 0], [4788.8003, 0]],
    ]
    for (const [ax, pos, velocity, acceleration] of cases) {
      t += dt
      expectNear(m.update({ x: ax, y: 0 }, t), { pos, velocity, acceleration, time: t })
    }
  })

  it('zigzag', () => {
    let t = 3
    const m = new PositionModeler(config, { pos: { x: -1, y: -1 }, time: t })
    const cases: Array<[[number, number], Expected['pos'], Expected['velocity'], Expected['acceleration']]> = [
      [[-0.5, -1], [-0.9545, -1], [8.1818, 0], [1472.7273, 0]],
      [[-0.5, -0.5], [-0.886, -0.9545], [12.3471, 8.1818], [749.7521, 1472.7273]],
      [[0, -0.5], [-0.7643, -0.886], [21.9056, 12.3471], [1720.5348, 749.7521]],
      [[0, 0], [-0.6218, -0.7643], [25.6493, 21.9056], [673.865, 1720.5348]],
      [[0.5, 0], [-0.4343, -0.6218], [33.7456, 25.6493], [1457.3298, 673.865]],
    ]
    for (const [anchor, pos, velocity, acceleration] of cases) {
      t += dt
      expectNear(m.update({ x: anchor[0], y: anchor[1] }, t), { pos, velocity, acceleration, time: t })
    }
  })

  it('smooth turn on a circle', () => {
    const circle = (a: number) => ({ x: Math.cos(a), y: Math.sin(a) })
    let t = 1
    const m = new PositionModeler(config, { pos: circle(0), time: t })
    const cases: Array<[number, Expected['pos'], Expected['velocity'], Expected['acceleration']]> = [
      [0.125, [0.9931, 0.0348], [-1.2456, 6.2621], [-224.2095, 1127.1768]],
      [0.25, [0.9629, 0.1168], [-5.4269, 14.7588], [-752.6373, 1529.4097]],
      [0.375, [0.8921, 0.2394], [-12.7511, 22.0623], [-1318.3523, 1314.632]],
    ]
    for (const [k, pos, velocity, acceleration] of cases) {
      t += dt
      expectNear(m.update(circle(Math.PI * k), t), { pos, velocity, acceleration, time: t })
    }
  })

  it('updates along a linear path', () => {
    const m = new PositionModeler(config, { pos: { x: 5, y: 10 }, time: 3 })
    const first = updateAlongLinearPath(m, { x: 5, y: 10 }, 3, { x: 15, y: 10 }, 3.05, 5)
    const expected: Expected[] = [
      { pos: [5.5891, 10], velocity: [58.9091, 0], acceleration: [5890.9092, 0], time: 3.01 },
      { pos: [6.7587, 10], velocity: [116.9613, 0], acceleration: [5805.2231, 0], time: 3.02 },
      { pos: [8.3355, 10], velocity: [157.6746, 0], acceleration: [4071.3291, 0], time: 3.03 },
      { pos: [10.1509, 10], velocity: [181.5411, 0], acceleration: [2386.6475, 0], time: 3.04 },
      { pos: [12.0875, 10], velocity: [193.6607, 0], acceleration: [1211.9609, 0], time: 3.05 },
    ]
    expect(first).toHaveLength(5)
    first.forEach((state, i) => expectNear(state, expected[i]))

    const second = updateAlongLinearPath(m, { x: 15, y: 10 }, 3.05, { x: 15, y: 16 }, 3.08, 3)
    const expected2: Expected[] = [
      { pos: [13.4876, 10.5891], velocity: [140.0123, 58.9091], acceleration: [-5364.8398, 5890.9092], time: 3.06 },
      { pos: [14.3251, 11.7587], velocity: [83.7508, 116.9613], acceleration: [-5626.1528, 5805.2217], time: 3.07 },
      { pos: [14.7584, 13.3355], velocity: [43.3291, 157.6746], acceleration: [-4042.1616, 4071.3291], time: 3.08 },
    ]
    second.forEach((state, i) => expectNear(state, expected2[i]))
  })
})

describe('end of stroke (upstream vectors)', () => {
  function withState(state: ModelerState) {
    const m = new PositionModeler(config, { pos: state.pos, time: state.time })
    m.state = state
    return m
  }

  it('stationary start catches up to the anchor', () => {
    const m = new PositionModeler(config, { pos: { x: 4, y: -2 }, time: 0 })
    const result = modelEndOfStroke(m, { x: 3, y: -1 }, 1 / 180, 20, 0.01)
    const expected: Expected[] = [
      { pos: [3.9091, -1.9091], velocity: [-16.3636, 16.3636], acceleration: [-2945.4546, 2945.4546], time: 0.0056 },
      { pos: [3.7719, -1.7719], velocity: [-24.6942, 24.6942], acceleration: [-1499.5044, 1499.5042], time: 0.0111 },
      { pos: [3.6194, -1.6194], velocity: [-27.4476, 27.4476], acceleration: [-495.6155, 495.615], time: 0.0167 },
      { pos: [3.4716, -1.4716], velocity: [-26.6045, 26.6044], acceleration: [151.7738, -151.7742], time: 0.0222 },
      { pos: [3.3401, -1.3401], velocity: [-23.6799, 23.6799], acceleration: [526.4102, -526.4102], time: 0.0278 },
      { pos: [3.2302, -1.2302], velocity: [-19.7725, 19.7725], acceleration: [703.3362, -703.3359], time: 0.0333 },
      { pos: [3.1434, -1.1434], velocity: [-15.6306, 15.6306], acceleration: [745.5521, -745.5518], time: 0.0389 },
      { pos: [3.0782, -1.0782], velocity: [-11.7244, 11.7244], acceleration: [703.1044, -703.1039], time: 0.0444 },
      { pos: [3.032, -1.032], velocity: [-8.3149, 8.3149], acceleration: [613.7169, -613.7166], time: 0.05 },
      { pos: [3.0014, -1.0014], velocity: [-5.5133, 5.5133], acceleration: [504.2921, -504.2918], time: 0.0556 },
    ]
    expect(result).toHaveLength(expected.length)
    result.forEach((state, i) => expectNear(state, expected[i]))
    // the model itself is restored
    expect(m.state.time).toBe(0)
    expect(m.state.pos).toEqual({ x: 4, y: -2 })
  })

  it('moving start with an overshoot-halved step', () => {
    const m = withState({ pos: { x: -1, y: 2 }, velocity: { x: 40, y: 10 }, acceleration: { x: 0, y: 0 }, time: 1 })
    const result = modelEndOfStroke(m, { x: 7, y: 2 }, 1 / 120, 20, 0.01)
    const expected: Expected[] = [
      { pos: [0.7697, 2.0333], velocity: [212.3636, 4], acceleration: [20683.6367, -720], time: 1.0083 },
      { pos: [2.752, 2.0398], velocity: [237.8711, 0.7818], acceleration: [3060.8916, -386.1817], time: 1.0167 },
      { pos: [4.4138, 2.0343], velocity: [199.4186, -0.6654], acceleration: [-4614.2959, -173.6631], time: 1.025 },
      { pos: [5.6075, 2.0251], velocity: [143.2474, -1.1081], acceleration: [-6740.541, -53.133], time: 1.0333 },
      { pos: [6.3698, 2.0162], velocity: [91.4784, -1.0586], acceleration: [-6212.2896, 5.9471], time: 1.0417 },
      { pos: [6.8037, 2.0094], velocity: [52.0592, -0.8222], acceleration: [-4730.2935, 28.3621], time: 1.05 },
      { pos: [6.9655, 2.0065], velocity: [38.8512, -0.6909], acceleration: [-3169.9351, 31.5268], time: 1.0542 },
      { pos: [6.985, 2.0062], velocity: [37.4471, -0.675], acceleration: [-2695.7649, 30.5478], time: 1.0547 },
    ]
    expect(result).toHaveLength(expected.length)
    result.forEach((state, i) => expectNear(state, expected[i]))
  })

  it('stops at the iteration cap', () => {
    const m = withState({ pos: { x: 8, y: -3 }, velocity: { x: -100, y: -150 }, acceleration: { x: 0, y: 0 }, time: 1 })
    const result = modelEndOfStroke(m, { x: -9, y: -10 }, 0.0001, 10, 0.001)
    expect(result).toHaveLength(10)
    expectNear(result[0], { pos: [7.9896, -3.0151], velocity: [-104.2873, -150.9818], acceleration: [-42872.7266, -9818.1816], time: 1.0001 })
    expectNear(result[9], { pos: [7.877, -3.1552], velocity: [-141.3597, -159.3065], acceleration: [-39861.0977, -8801.2402], time: 1.001 })
  })
})

describe('stylus state modeler (upstream vectors)', () => {
  const sample = (x: number, y: number, pressure: number) => ({ pos: { x, y }, pressure })
  const q = (m: StylusStateModeler, x: number, y: number) => m.query({ x, y })

  it('defaults to 1 without samples and returns the single pressure', () => {
    const m = new StylusStateModeler(10)
    expect(q(m, 0, 0)).toBe(1)
    m.update(sample(0, 0, 0.75))
    expect(q(m, 1, 1)).toBe(0.75)
  })

  it('interpolates over several samples', () => {
    const m = new StylusStateModeler(10)
    m.update(sample(0.5, 1.5, 0.3))
    m.update(sample(2, 1.5, 0.6))
    m.update(sample(3, 3.5, 0.8))
    m.update(sample(3.5, 4, 0.2))
    expect(q(m, 0, 2)).toBeCloseTo(0.3, 5)
    expect(q(m, 1, 2)).toBeCloseTo(0.4, 5)
    expect(q(m, 2, 1.5)).toBeCloseTo(0.6, 5)
    expect(q(m, 2.5, 1.875)).toBeCloseTo(0.65, 5)
    expect(q(m, 2.5, 3.125)).toBeCloseTo(0.75, 5)
    expect(q(m, 2.5, 4)).toBeCloseTo(0.8, 5)
    expect(q(m, 3, 4)).toBeCloseTo(0.5, 5)
    expect(q(m, 4, 4)).toBeCloseTo(0.2, 5)
  })

  it('forgets samples past the cap and resets', () => {
    const m = new StylusStateModeler(10)
    const pts: Array<[number, number, number]> = [
      [1, 1, 0.6], [-1, 2, 0.3], [-4, 0, 0.9], [-6, -3, 0.4], [-5, -5, 0.3],
      [-3, -4, 0.6], [-6, -7, 0.9], [-9, -8, 0.8], [-11, -5, 0.2], [-10, -2, 0.7],
    ]
    pts.forEach(([x, y, p]) => m.update(sample(x, y, p)))
    expect(q(m, 2, 0)).toBeCloseTo(0.6, 5)
    expect(q(m, 1, 3.5)).toBeCloseTo(0.45, 5)
    expect(q(m, -3, 17 / 6)).toBeCloseTo(0.5, 5)
    m.update(sample(-8, 0, 0.6))
    expect(q(m, 2, 0)).toBeCloseTo(0.3, 5)
    expect(q(m, 1, 3.5)).toBeCloseTo(0.3, 5)
    m.update(sample(-8, 0, 0.6))
    expect(q(m, 2, 0)).toBeCloseTo(0.9, 5)
    expect(q(m, -3, 17 / 6)).toBeCloseTo(0.9, 5)
    m.reset(10)
    expect(q(m, 10, 12)).toBe(1)
    m.update(sample(-1, 4, 0.4))
    m.update(sample(-3, 0, 0.7))
    expect(q(m, -2, 2)).toBeCloseTo(0.55, 5)
    expect(q(m, 0, 5)).toBeCloseTo(0.4, 5)
  })
})

describe('engine (upstream vectors)', () => {
  const engine = (overrides = {}) => new StrokeModelerEngine({ ...SUGGESTED_PARAMS, ...overrides })
  const input = (kind: 'down' | 'move' | 'up', x: number, y: number, time: number, pressure = 1) => ({ kind, x, y, time, pressure })
  const must = (r: ReturnType<StrokeModelerEngine['update']>) => {
    if (!r.ok) throw new Error(r.error)
    return r.points
  }

  it('input rate slower than the output rate upsamples (first interval)', () => {
    const e = engine({ stylusStateModelerMaxInputSamples: 20 })
    const down = must(e.update(input('down', 3, 4, 0)))
    expect(down).toHaveLength(1)
    expect(e.predict()).toEqual([])
    const out = must(e.update(input('move', 3.2, 4.2, Math.fround(1 / 30))))
    const expected = [
      [3.0019, 4.0019, 0.0048, 0.4007],
      [3.0069, 4.0069, 0.0095, 1.0381],
      [3.0154, 4.0154, 0.0143, 1.7883],
      [3.0276, 4.0276, 0.019, 2.5626],
      [3.0433, 4.0433, 0.0238, 3.301],
      [3.0622, 4.0622, 0.0286, 3.9665],
      [3.0838, 4.0838, 0.0333, 4.5397],
    ]
    expect(out).toHaveLength(expected.length)
    out.forEach((p, i) => {
      expect(Math.abs(p.x - expected[i][0])).toBeLessThan(3e-3)
      expect(Math.abs(p.y - expected[i][1])).toBeLessThan(3e-3)
      expect(Math.abs(p.time - expected[i][2])).toBeLessThan(3e-3)
      expect(Math.abs(p.vx - expected[i][3])).toBeLessThan(3e-3)
      expect(p.pressure).toBeCloseTo(1, 5)
    })
    const predicted = e.predict() ?? []
    expect(predicted.length).toBeGreaterThan(0)
    expect(predicted[0].x).toBeCloseTo(3.1095, 2)
    expect(predicted[0].time).toBeCloseTo(0.0389, 3)
  })

  it('wobble smoothed slow input', () => {
    const e = engine()
    must(e.update(input('down', -6, -2, 4)))
    const out = must(e.update(input('move', -6.02, -2, 4 + 0.0167)))
    const expected = [
      [-6.0003, 4.0042, -0.0615],
      [-6.0009, 4.0084, -0.1628],
      [-6.0021, 4.0125, -0.2868],
      [-6.0039, 4.0167, -0.4203],
    ]
    expect(out).toHaveLength(4)
    out.forEach((p, i) => {
      expect(Math.abs(p.x - expected[i][0])).toBeLessThan(3e-3)
      expect(Math.abs(p.time - expected[i][1])).toBeLessThan(3e-3)
      expect(Math.abs(p.vx - expected[i][2])).toBeLessThan(3e-3)
    })
  })

  it('up with no time delta still generates one output', () => {
    const e = engine()
    must(e.update(input('down', 5, 5, 0)))
    const move = must(e.update(input('move', 5, 5, 0.002)))
    expect(move).toHaveLength(1)
    expect(move[0].time).toBeCloseTo(0.002, 3)
    const up = must(e.update(input('up', 5, 5, 0.002)))
    expect(up).toHaveLength(1)
    expect(up[0].x).toBeCloseTo(5, 3)
    expect(up[0].time).toBeCloseTo(0.0076, 3)
    expect(e.predict()).toBeNull()
  })

  it('rejects out-of-order, far apart, backwards and duplicate input', () => {
    let e = engine()
    expect(e.update(input('move', 0, 0, 0))).toEqual({ ok: false, error: 'unexpected-move' })
    expect(e.update(input('up', 0, 0, 0))).toEqual({ ok: false, error: 'unexpected-up' })

    e = engine()
    expect(e.update(input('down', 0, 0, 0, 0.2)).ok).toBe(true)
    expect(e.update(input('down', 0, 0, 0, 0.2))).toEqual({ ok: false, error: 'unexpected-down' })
    expect(e.update(input('move', 0, 0, 2147483647, 0.2))).toEqual({ ok: false, error: 'too-far-apart' })
    expect(e.update(input('up', 0, 0, 2147483647, 0.2))).toEqual({ ok: false, error: 'too-far-apart' })

    e = engine()
    e.update(input('down', 0, 0, 0))
    expect(e.update(input('move', 1, 1, -0.1))).toEqual({ ok: false, error: 'negative-time-delta' })
    expect(e.update(input('move', 1, 1, 0.1, 1)).ok).toBe(true)
    expect(e.update(input('up', 1, 1, 0.09, 1))).toEqual({ ok: false, error: 'negative-time-delta' })
  })

  it('rejects a duplicate move and negative delta on up', () => {
    const e = engine()
    e.update(input('down', 0, 0, 0, 0.2))
    expect(e.update(input('move', 1, 2, 0.1, 0.1)).ok).toBe(true)
    expect(e.update(input('move', 1, 2, 0.1, 0.1))).toEqual({ ok: false, error: 'duplicate' })
    expect(e.update(input('up', 1, 2, 0.09, 0.1))).toEqual({ ok: false, error: 'negative-time-delta' })
  })

  it('reset clears the stroke and prediction needs a stroke in progress', () => {
    const e = engine()
    expect(e.predict()).toBeNull()
    e.update(input('down', -8, -10, 0))
    expect(e.predict()).toEqual([])
    e.update(input('move', 0, 0, 0.02))
    expect((e.predict() ?? []).length).toBeGreaterThan(0)
    e.reset()
    expect(e.predict()).toBeNull()
  })
})
