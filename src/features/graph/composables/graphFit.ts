export interface FitPoint {
  x: number
  y: number
  degree?: number
}

export interface FitResult {
  scale: number
  tx: number
  ty: number
}

export const FIT_MIN_SCALE = 0.1
export const FIT_MAX_SCALE = 5
// Fitting a tiny cluster (one or two nodes) must not zoom in absurdly far.
const FIT_MAX_AUTO_SCALE = 1.5
const FIT_PADDING = 60

function pointRadius(point: FitPoint): number {
  return 5 + Math.min((point.degree ?? 0) * 1.5, 12)
}

/**
 * Computes a camera (scale + translation) that fits every finite point into a
 * width x height viewport with padding. Returns null when there is nothing to
 * fit or the viewport has no area yet.
 */
export function computeFitCamera(
  points: readonly FitPoint[],
  width: number,
  height: number,
  padding = FIT_PADDING,
): FitResult | null {
  if (!(width > 0) || !(height > 0)) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
    const r = pointRadius(p)
    if (p.x - r < minX) minX = p.x - r
    if (p.y - r < minY) minY = p.y - r
    if (p.x + r > maxX) maxX = p.x + r
    if (p.y + r > maxY) maxY = p.y + r
  }
  if (!Number.isFinite(minX)) return null
  const gw = maxX - minX + padding * 2
  const gh = maxY - minY + padding * 2
  const scale = Math.max(FIT_MIN_SCALE, Math.min(FIT_MAX_AUTO_SCALE, width / gw, height / gh))
  return {
    scale,
    tx: width / 2 - ((minX + maxX) / 2) * scale,
    ty: height / 2 - ((minY + maxY) / 2) * scale,
  }
}
