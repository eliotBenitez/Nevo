/*
 * Ported to TypeScript from ink-stroke-modeler-rs
 * (https://github.com/flxzt/ink-stroke-modeler-rs, (c) 2025 The
 * ink-stroke-modeler-rs Authors, MIT OR Apache-2.0), a Rust rewrite of
 * google/ink-stroke-modeler (Apache-2.0, (c) 2022 Google LLC). Modified: translated
 * to TypeScript. See NOTICE.txt, LICENSE-APACHE-2.0.txt and LICENSE-MIT.txt.
 */

import { StrokeModelerEngine, type ModeledPoint, type ModelerInput } from './engine'
import { NEVO_PARAMS, type ModelerParams } from './params'

export type { ModeledPoint, ModelerInput, ModelerInputKind } from './engine'

export interface StrokeModeler {
  /**
   * Feeds one raw input (time in seconds, any origin) and returns the newly
   * modeled points to append. Invalid input (non-finite values, time going
   * backwards, duplicates, events out of order) is skipped and returns `[]`.
   */
  update(input: ModelerInput): ModeledPoint[]
  /** Points the pen tip would still traverse to reach the last raw input. Never stored. */
  predict(): ModeledPoint[]
  /** Drops any stroke in progress. */
  reset(): void
}

const isFiniteInput = (input: ModelerInput): boolean =>
  Number.isFinite(input.x) &&
  Number.isFinite(input.y) &&
  Number.isFinite(input.time) &&
  Number.isFinite(input.pressure)

export function createStrokeModeler(params: ModelerParams = NEVO_PARAMS): StrokeModeler {
  const engine = new StrokeModelerEngine(params)
  // Longest gap the engine accepts in one call (it rejects more than
  // samplingMaxOutputsPerCall resampled outputs as "too far apart").
  const maxGap = (params.samplingMaxOutputsPerCall - 1) / params.samplingMinOutputRate
  let timeOffset = 0
  let lastTime: number | null = null

  return {
    update(input) {
      if (!isFiniteInput(input)) return []
      if (input.kind === 'down') {
        timeOffset = 0
        lastTime = null
      }
      // A pen held still mid-stroke sends no events, so the next one can arrive
      // seconds later. Restarting the model there would drop the raw points it had
      // not emitted yet and jump to the new position; instead the pause is
      // shortened to the longest gap the engine accepts. The spring settles well
      // within that time, so the trajectory stays continuous and nothing is lost.
      let time = input.time - timeOffset
      if (lastTime !== null && time - lastTime > maxGap) {
        timeOffset += time - lastTime - maxGap
        time = lastTime + maxGap
      }
      const result = engine.update({ ...input, time })
      if (!result.ok) return []
      lastTime = time
      return result.points
    },
    predict() {
      return engine.predict() ?? []
    },
    reset() {
      engine.reset()
    },
  }
}
