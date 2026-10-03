/*
 * Ported to TypeScript from ink-stroke-modeler-rs
 * (https://github.com/flxzt/ink-stroke-modeler-rs, (c) 2025 The
 * ink-stroke-modeler-rs Authors, MIT OR Apache-2.0), a Rust rewrite of
 * google/ink-stroke-modeler (Apache-2.0, (c) 2022 Google LLC). Modified: translated
 * to TypeScript. See NOTICE.txt, LICENSE-APACHE-2.0.txt and LICENSE-MIT.txt.
 */

export interface Vec2 {
  x: number
  y: number
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

/** 0 below `start`, 1 above `end`, linear in between; works for reversed ranges. */
export function normalize01(start: number, end: number, value: number): number {
  if (start === end) return value > start ? 1 : 0
  return clamp01((value - start) / (end - start))
}

/** Linear interpolation with the amount clamped to [0, 1]. */
export function interp(start: number, end: number, amount: number): number {
  return start + (end - start) * clamp01(amount)
}

export function interp2(start: Vec2, end: Vec2, amount: number): Vec2 {
  const t = clamp01(amount)
  return { x: start.x + t * (end.x - start.x), y: start.y + t * (end.y - start.y) }
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Ratio along the segment of the point closest to `point`, clamped to [0, 1]. */
export function nearestPointOnSegment(start: Vec2, end: Vec2, point: Vec2): number {
  if (start.x === end.x && start.y === end.y) return 0
  const seg = { x: end.x - start.x, y: end.y - start.y }
  const proj = { x: point.x - start.x, y: point.y - start.y }
  return clamp01(dot(proj, seg) / dot(seg, seg))
}
