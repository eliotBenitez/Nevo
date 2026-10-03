/*
 * Ported to TypeScript from ink-stroke-modeler-rs
 * (https://github.com/flxzt/ink-stroke-modeler-rs, (c) 2025 The
 * ink-stroke-modeler-rs Authors, MIT OR Apache-2.0), a Rust rewrite of
 * google/ink-stroke-modeler (Apache-2.0, (c) 2022 Google LLC). Modified: translated
 * to TypeScript. See NOTICE.txt, LICENSE-APACHE-2.0.txt and LICENSE-MIT.txt.
 */

import type { Vec2 } from './math'
import type { ModelerState, PositionModeler } from './positionModeler'

/** Number of upsampled model steps needed to cover `deltaTime` at `minOutputRate`. */
export function resampleStepCount(deltaTime: number, minOutputRate: number): number {
  return Math.ceil(deltaTime * minOutputRate)
}

/**
 * Feeds `steps` evenly spaced anchors on the segment start->end (and evenly
 * spaced times) into the position model and returns each resulting state.
 */
export function updateAlongLinearPath(
  modeler: PositionModeler,
  startPos: Vec2,
  startTime: number,
  endPos: Vec2,
  endTime: number,
  steps: number,
): ModelerState[] {
  const out: ModelerState[] = []
  for (let i = 1; i <= steps; i += 1) {
    const frac = i / steps
    out.push(
      modeler.update(
        { x: startPos.x + frac * (endPos.x - startPos.x), y: startPos.y + frac * (endPos.y - startPos.y) },
        startTime + frac * (endTime - startTime),
      ),
    )
  }
  return out
}
