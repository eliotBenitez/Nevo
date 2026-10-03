/*
 * Ported to TypeScript from ink-stroke-modeler-rs
 * (https://github.com/flxzt/ink-stroke-modeler-rs, (c) 2025 The
 * ink-stroke-modeler-rs Authors, MIT OR Apache-2.0), a Rust rewrite of
 * google/ink-stroke-modeler (Apache-2.0, (c) 2022 Google LLC). Modified: translated
 * to TypeScript. See NOTICE.txt, LICENSE-APACHE-2.0.txt and LICENSE-MIT.txt.
 */

/** Time is in seconds, distance in the caller's units (Nevo: page points). */
export interface ModelerParams {
  /** Window length for the wobble smoother moving average. */
  wobbleSmootherTimeout: number
  /** Speed at which wobble smoothing is maximal. */
  wobbleSmootherSpeedFloor: number
  /** Speed at which wobble smoothing stops. Must exceed the floor. */
  wobbleSmootherSpeedCeiling: number
  /** Pen tip mass multiplied by the spring constant. */
  positionModelerSpringMassConstant: number
  /** Share of velocity subtracted from acceleration per unit time. */
  positionModelerDragConstant: number
  /** Minimum modeled outputs per second; slower input is upsampled. */
  samplingMinOutputRate: number
  /** End-of-stroke iteration stops within this distance of the final input. */
  samplingEndOfStrokeStoppingDistance: number
  /** Cap on end-of-stroke iterations (< 1000). */
  samplingEndOfStrokeMaxIterations: number
  /** Cap on outputs per update; a longer gap is rejected as too far apart. */
  samplingMaxOutputsPerCall: number
  /** Raw inputs kept for pressure interpolation. */
  stylusStateModelerMaxInputSamples: number
}

/** `ModelerParams::suggested()` of the upstream library. */
export const SUGGESTED_PARAMS: Readonly<ModelerParams> = Object.freeze({
  wobbleSmootherTimeout: 0.04,
  wobbleSmootherSpeedFloor: 1.31,
  wobbleSmootherSpeedCeiling: 1.44,
  positionModelerSpringMassConstant: 11 / 32400,
  positionModelerDragConstant: 72,
  samplingMinOutputRate: 180,
  samplingEndOfStrokeStoppingDistance: 0.001,
  samplingEndOfStrokeMaxIterations: 20,
  samplingMaxOutputsPerCall: 20,
  stylusStateModelerMaxInputSamples: 10,
})

/**
 * Parameters used by Nevo: the upstream suggestion with the same overrides
 * Rnote applies for its "Modeled" pen path (120 Hz minimum rate, 0.01 stopping
 * distance, 200 outputs per call so pauses up to ~1.6 s do not restart the
 * model, 20 pressure samples).
 */
export const NEVO_PARAMS: Readonly<ModelerParams> = Object.freeze({
  ...SUGGESTED_PARAMS,
  samplingMinOutputRate: 120,
  samplingEndOfStrokeStoppingDistance: 0.01,
  samplingEndOfStrokeMaxIterations: 20,
  samplingMaxOutputsPerCall: 200,
  stylusStateModelerMaxInputSamples: 20,
})

/** Returns the list of problems; empty when the parameters are valid. */
export function validateParams(params: ModelerParams): string[] {
  const problems: string[] = []
  const finite = Object.values(params).every((value) => Number.isFinite(value))
  if (!finite) problems.push('all parameters must be finite numbers')
  if (!(params.positionModelerSpringMassConstant > 0)) problems.push('positionModelerSpringMassConstant must be positive')
  if (!(params.positionModelerDragConstant > 0)) problems.push('positionModelerDragConstant must be positive')
  if (!(params.samplingMinOutputRate > 0)) problems.push('samplingMinOutputRate must be positive')
  if (!(params.samplingEndOfStrokeStoppingDistance > 0)) problems.push('samplingEndOfStrokeStoppingDistance must be positive')
  if (!(params.samplingEndOfStrokeMaxIterations > 0)) problems.push('samplingEndOfStrokeMaxIterations must be positive')
  if (!(params.samplingEndOfStrokeMaxIterations < 1000)) problems.push('samplingEndOfStrokeMaxIterations must be below 1000')
  if (!(params.samplingMaxOutputsPerCall > 0)) problems.push('samplingMaxOutputsPerCall must be positive')
  if (!(params.wobbleSmootherTimeout > 0)) problems.push('wobbleSmootherTimeout must be positive')
  if (!(params.wobbleSmootherSpeedFloor > 0)) problems.push('wobbleSmootherSpeedFloor must be positive')
  if (!(params.wobbleSmootherSpeedCeiling > 0)) problems.push('wobbleSmootherSpeedCeiling must be positive')
  if (!(params.wobbleSmootherSpeedFloor < params.wobbleSmootherSpeedCeiling)) problems.push('wobbleSmootherSpeedFloor must be below the ceiling')
  return problems
}
