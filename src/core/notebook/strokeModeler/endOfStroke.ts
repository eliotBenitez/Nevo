/*
 * Ported to TypeScript from ink-stroke-modeler-rs
 * (https://github.com/flxzt/ink-stroke-modeler-rs, (c) 2025 The
 * ink-stroke-modeler-rs Authors, MIT OR Apache-2.0), a Rust rewrite of
 * google/ink-stroke-modeler (Apache-2.0, (c) 2022 Google LLC). Modified: translated
 * to TypeScript. See NOTICE.txt, LICENSE-APACHE-2.0.txt and LICENSE-MIT.txt.
 */

import { dist, nearestPointOnSegment, type Vec2 } from './math'
import { cloneState, type ModelerState, type PositionModeler } from './positionModeler'

/**
 * Lets the pen tip catch up with `anchor` (the last raw input) and returns the
 * candidate states. Used both for the final catch-up and for prediction.
 * The modeler state is restored before returning, so the model is unchanged.
 */
export function modelEndOfStroke(
  modeler: PositionModeler,
  anchor: Vec2,
  initialDeltaTime: number,
  maxIterations: number,
  stopDistance: number,
): ModelerState[] {
  const initial = cloneState(modeler.state)
  let deltaTime = initialDeltaTime
  const out: ModelerState[] = []

  for (let i = 0; i < maxIterations; i += 1) {
    const previous = cloneState(modeler.state)
    const candidate = modeler.update(anchor, previous.time + deltaTime)

    if (dist(previous.pos, candidate.pos) < stopDistance) {
      modeler.state = initial
      return out
    }

    if (nearestPointOnSegment(previous.pos, candidate.pos, anchor) < 1) {
      // overshoot: retry the same step with half the time delta
      deltaTime *= 0.5
      modeler.state = previous
      continue
    }
    out.push(candidate)

    if (dist(candidate.pos, anchor) < stopDistance) {
      modeler.state = initial
      return out
    }
  }
  modeler.state = initial
  return out
}
