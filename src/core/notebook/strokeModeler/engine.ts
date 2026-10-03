/*
 * Ported to TypeScript from ink-stroke-modeler-rs
 * (https://github.com/flxzt/ink-stroke-modeler-rs, (c) 2025 The
 * ink-stroke-modeler-rs Authors, MIT OR Apache-2.0), a Rust rewrite of
 * google/ink-stroke-modeler (Apache-2.0, (c) 2022 Google LLC). Modified: translated
 * to TypeScript. See NOTICE.txt, LICENSE-APACHE-2.0.txt and LICENSE-MIT.txt.
 */

import { modelEndOfStroke } from './endOfStroke'
import type { Vec2 } from './math'
import { type ModelerParams, validateParams } from './params'
import { PositionModeler, type ModelerState } from './positionModeler'
import { resampleStepCount, updateAlongLinearPath } from './resampler'
import { StylusStateModeler } from './stylusStateModeler'
import { WobbleSmoother } from './wobbleSmoother'

export type ModelerInputKind = 'down' | 'move' | 'up'

export interface ModelerInput {
  kind: ModelerInputKind
  x: number
  y: number
  /** Seconds. Only differences matter. */
  time: number
  pressure: number
}

export interface ModeledPoint {
  x: number
  y: number
  pressure: number
  time: number
  vx: number
  vy: number
}

export type ModelerError =
  | 'unexpected-down'
  | 'unexpected-move'
  | 'unexpected-up'
  | 'negative-time-delta'
  | 'duplicate'
  | 'too-far-apart'

export type ModelerResult = { ok: true; points: ModeledPoint[] } | { ok: false; error: ModelerError }

interface LastEvent {
  kind: ModelerInputKind
  x: number
  y: number
  time: number
  pressure: number
}

const fail = (error: ModelerError): ModelerResult => ({ ok: false, error })

/**
 * Stroke model: wobble smoothing -> spring/drag position model with uniform
 * resampling -> pressure interpolation, plus end-of-stroke catch-up and
 * prediction. Unit-agnostic. Faithful to `StrokeModeler` of the upstream port;
 * invalid input is reported as an error value and leaves the model untouched.
 */
export class StrokeModelerEngine {
  private wobble: WobbleSmoother
  private stylus: StylusStateModeler
  private position: PositionModeler | null = null
  private lastEvent: LastEvent | null = null
  private lastCorrected: Vec2 | null = null

  constructor(private readonly params: ModelerParams) {
    const problems = validateParams(params)
    if (problems.length > 0) throw new Error(`Invalid stroke modeler params: ${problems.join('; ')}`)
    this.wobble = this.createWobble()
    this.stylus = new StylusStateModeler(params.stylusStateModelerMaxInputSamples)
  }

  get active(): boolean {
    return this.lastEvent !== null
  }

  reset() {
    this.wobble = this.createWobble()
    this.stylus.reset(this.params.stylusStateModelerMaxInputSamples)
    this.position = null
    this.lastEvent = null
    this.lastCorrected = null
  }

  update(input: ModelerInput): ModelerResult {
    if (input.kind === 'down') return this.down(input)
    const last = this.lastEvent
    const position = this.position
    const lastCorrected = this.lastCorrected
    if (!last || !position || !lastCorrected) {
      return fail(input.kind === 'move' ? 'unexpected-move' : 'unexpected-up')
    }

    if (input.time - last.time < 0) return fail('negative-time-delta')
    if (
      input.kind === last.kind &&
      input.x === last.x &&
      input.y === last.y &&
      input.time === last.time &&
      input.pressure === last.pressure
    ) {
      return fail('duplicate')
    }
    const steps = resampleStepCount(input.time - last.time, this.params.samplingMinOutputRate)
    if (steps > this.params.samplingMaxOutputsPerCall) return fail('too-far-apart')

    this.stylus.update({ pos: { x: input.x, y: input.y }, pressure: input.pressure })
    // The wobble-smoothed position is the anchor for both Move and Up, matching the upstream port.
    const end = this.wobble.update({ x: input.x, y: input.y }, input.time)
    const states = updateAlongLinearPath(position, lastCorrected, last.time, end, input.time, steps)
    const points = states.map((state) => this.toPoint(state))

    if (input.kind === 'up') {
      const anchor = { x: input.x, y: input.y }
      const catchUp = modelEndOfStroke(
        position,
        anchor,
        1 / this.params.samplingMinOutputRate,
        this.params.samplingEndOfStrokeMaxIterations,
        this.params.samplingEndOfStrokeStoppingDistance,
      )
      points.push(...catchUp.map((state) => this.toPoint(state)))
      if (points.length === 0) {
        // keep the output time strictly after the previous one when Up repeats the last Move time
        points.push(this.toPoint({ ...position.state, time: position.state.time + 1 / this.params.samplingMinOutputRate }))
      }
      this.lastEvent = null
      return { ok: true, points }
    }

    this.lastEvent = { ...input }
    this.lastCorrected = end
    return { ok: true, points }
  }

  /** Models the catch-up to the last raw input without changing the model. */
  predict(): ModeledPoint[] | null {
    if (!this.lastEvent || !this.position) return null
    const states = modelEndOfStroke(
      this.position,
      { x: this.lastEvent.x, y: this.lastEvent.y },
      1 / this.params.samplingMinOutputRate,
      this.params.samplingEndOfStrokeMaxIterations,
      this.params.samplingEndOfStrokeStoppingDistance,
    )
    return states.map((state) => this.toPoint(state))
  }

  private down(input: ModelerInput): ModelerResult {
    if (this.lastEvent) return fail('unexpected-down')
    // a finished stroke leaves wobble history behind; every stroke starts clean
    this.reset()
    const pos = { x: input.x, y: input.y }
    this.wobble.update(pos, input.time)
    this.position = new PositionModeler(
      {
        springMassConstant: this.params.positionModelerSpringMassConstant,
        dragConstant: this.params.positionModelerDragConstant,
      },
      { pos, time: input.time },
    )
    this.lastEvent = { ...input }
    this.lastCorrected = pos
    this.stylus.update({ pos, pressure: input.pressure })
    return {
      ok: true,
      points: [{ x: pos.x, y: pos.y, pressure: input.pressure, time: input.time, vx: 0, vy: 0 }],
    }
  }

  private toPoint(state: ModelerState): ModeledPoint {
    return {
      x: state.pos.x,
      y: state.pos.y,
      pressure: this.stylus.query(state.pos),
      time: state.time,
      vx: state.velocity.x,
      vy: state.velocity.y,
    }
  }

  private createWobble(): WobbleSmoother {
    return new WobbleSmoother({
      timeout: this.params.wobbleSmootherTimeout,
      speedFloor: this.params.wobbleSmootherSpeedFloor,
      speedCeiling: this.params.wobbleSmootherSpeedCeiling,
    })
  }
}
