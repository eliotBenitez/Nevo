/*
 * Ported to TypeScript from ink-stroke-modeler-rs
 * (https://github.com/flxzt/ink-stroke-modeler-rs, (c) 2025 The
 * ink-stroke-modeler-rs Authors, MIT OR Apache-2.0), a Rust rewrite of
 * google/ink-stroke-modeler (Apache-2.0, (c) 2022 Google LLC). Modified: translated
 * to TypeScript. See NOTICE.txt, LICENSE-APACHE-2.0.txt and LICENSE-MIT.txt.
 */

import { interp, normalize01, type Vec2 } from './math'

interface WobbleSample {
  position: Vec2
  /** Raw position weighted by the duration since the previous sample. */
  weightedX: number
  weightedY: number
  distance: number
  duration: number
  time: number
}

export interface WobbleSmootherConfig {
  timeout: number
  speedFloor: number
  speedCeiling: number
}

/**
 * Time-weighted moving average of the raw position, blended with the raw
 * position by speed: slow movement is smoothed, fast movement is untouched.
 */
export class WobbleSmoother {
  private samples: WobbleSample[] = []
  private head = 0
  private weightedX = 0
  private weightedY = 0
  private durationSum = 0
  private distanceSum = 0

  constructor(private readonly config: WobbleSmootherConfig) {}

  reset() {
    this.samples = []
    this.head = 0
    this.weightedX = 0
    this.weightedY = 0
    this.durationSum = 0
    this.distanceSum = 0
  }

  update(position: Vec2, time: number): Vec2 {
    const last = this.samples[this.samples.length - 1]
    if (!last) {
      this.samples.push({ position, weightedX: 0, weightedY: 0, distance: 0, duration: 0, time })
      return position
    }

    const duration = time - last.time
    const sample: WobbleSample = {
      position,
      weightedX: position.x * duration,
      weightedY: position.y * duration,
      distance: Math.hypot(position.x - last.position.x, position.y - last.position.y),
      duration,
      time,
    }
    this.samples.push(sample)
    this.weightedX += sample.weightedX
    this.weightedY += sample.weightedY
    this.distanceSum += sample.distance
    this.durationSum += sample.duration

    while (this.samples[this.head].time < time - this.config.timeout) {
      const front = this.samples[this.head]
      this.head += 1
      this.weightedX -= front.weightedX
      this.weightedY -= front.weightedY
      this.distanceSum -= front.distance
      this.durationSum -= front.duration
    }
    if (this.head > 64) {
      this.samples = this.samples.slice(this.head)
      this.head = 0
    }

    if (this.durationSum < 1e-12) return position

    const avgX = this.weightedX / this.durationSum
    const avgY = this.weightedY / this.durationSum
    const avgSpeed = this.distanceSum / this.durationSum
    const norm = normalize01(this.config.speedFloor, this.config.speedCeiling, avgSpeed)
    return { x: interp(avgX, position.x, norm), y: interp(avgY, position.y, norm) }
  }
}
