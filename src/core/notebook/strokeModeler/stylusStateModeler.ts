/*
 * Ported to TypeScript from ink-stroke-modeler-rs
 * (https://github.com/flxzt/ink-stroke-modeler-rs, (c) 2025 The
 * ink-stroke-modeler-rs Authors, MIT OR Apache-2.0), a Rust rewrite of
 * google/ink-stroke-modeler (Apache-2.0, (c) 2022 Google LLC). Modified: translated
 * to TypeScript. See NOTICE.txt, LICENSE-APACHE-2.0.txt and LICENSE-MIT.txt.
 */

import { dist, interp, interp2, nearestPointOnSegment, type Vec2 } from './math'

export interface StylusSample {
  pos: Vec2
  pressure: number
}

/**
 * Interpolates the pressure of a modeled position from the closest segment of
 * the most recent raw inputs.
 */
export class StylusStateModeler {
  private samples: StylusSample[] = []
  private maxSamples: number

  constructor(maxSamples: number) {
    this.maxSamples = Math.max(1, Math.floor(maxSamples))
  }

  reset(maxSamples = this.maxSamples) {
    this.samples = []
    this.maxSamples = Math.max(1, Math.floor(maxSamples))
  }

  update(sample: StylusSample) {
    this.samples.push({ pos: { ...sample.pos }, pressure: sample.pressure })
    if (this.samples.length > this.maxSamples) this.samples.shift()
  }

  query(pos: Vec2): number {
    if (this.samples.length === 0) return 1
    if (this.samples.length === 1) return this.samples[0].pressure

    let best = Number.POSITIVE_INFINITY
    let ratio = 0
    let startPressure = 1
    let endPressure = 1
    for (let i = 0; i < this.samples.length - 1; i += 1) {
      const start = this.samples[i]
      const end = this.samples[i + 1]
      const r = nearestPointOnSegment(start.pos, end.pos, pos)
      const d = dist(pos, interp2(start.pos, end.pos, r))
      if (d < best) {
        best = d
        ratio = r
        startPressure = start.pressure
        endPressure = end.pressure
      }
    }
    return interp(startPressure, endPressure, ratio)
  }
}
