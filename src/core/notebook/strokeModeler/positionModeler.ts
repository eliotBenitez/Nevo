/*
 * Ported to TypeScript from ink-stroke-modeler-rs
 * (https://github.com/flxzt/ink-stroke-modeler-rs, (c) 2025 The
 * ink-stroke-modeler-rs Authors, MIT OR Apache-2.0), a Rust rewrite of
 * google/ink-stroke-modeler (Apache-2.0, (c) 2022 Google LLC). Modified: translated
 * to TypeScript. See NOTICE.txt, LICENSE-APACHE-2.0.txt and LICENSE-MIT.txt.
 */

import type { Vec2 } from './math'

export interface ModelerState {
  pos: Vec2
  velocity: Vec2
  acceleration: Vec2
  time: number
}

export interface PositionModelerConfig {
  springMassConstant: number
  dragConstant: number
}

/**
 * Pen tip modeled as a mass on a spring attached to the moving raw anchor,
 * with drag. Integrated with explicit Euler steps like the upstream library.
 */
export class PositionModeler {
  state: ModelerState

  constructor(
    private readonly config: PositionModelerConfig,
    start: { pos: Vec2; time: number },
  ) {
    this.state = {
      pos: { ...start.pos },
      velocity: { x: 0, y: 0 },
      acceleration: { x: 0, y: 0 },
      time: start.time,
    }
  }

  /** Advances the tip towards `anchor` at `time` and returns a copy of the new state. */
  update(anchor: Vec2, time: number): ModelerState {
    const dt = time - this.state.time
    const { pos, velocity } = this.state
    const { springMassConstant, dragConstant } = this.config
    const acceleration = {
      x: (anchor.x - pos.x) / springMassConstant - dragConstant * velocity.x,
      y: (anchor.y - pos.y) / springMassConstant - dragConstant * velocity.y,
    }
    const nextVelocity = { x: velocity.x + dt * acceleration.x, y: velocity.y + dt * acceleration.y }
    this.state = {
      pos: { x: pos.x + dt * nextVelocity.x, y: pos.y + dt * nextVelocity.y },
      velocity: nextVelocity,
      acceleration,
      time,
    }
    return cloneState(this.state)
  }
}

export function cloneState(state: ModelerState): ModelerState {
  return {
    pos: { ...state.pos },
    velocity: { ...state.velocity },
    acceleration: { ...state.acceleration },
    time: state.time,
  }
}
