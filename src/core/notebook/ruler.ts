import type { NotebookPointV1 } from './types'

export interface NotebookRulerPose { x: number; y: number; angle: number }
export interface NotebookRulerGuide {
  origin: { x: number; y: number }
  direction: { x: number; y: number }
}

export const NOTEBOOK_RULER_LENGTH = 360
export const NOTEBOOK_RULER_HEIGHT = 52
export const NOTEBOOK_POINTS_PER_MM = 72 / 25.4

export function normalizeNotebookRulerAngle(angle: number): number {
  return ((angle + 180) % 360 + 360) % 360 - 180
}

export function captureNotebookRulerGuide(
  pose: NotebookRulerPose,
  point: NotebookPointV1,
  zoom: number,
): NotebookRulerGuide | null {
  const angle = pose.angle * Math.PI / 180
  const direction = { x: Math.cos(angle), y: Math.sin(angle) }
  const normal = { x: -direction.y, y: direction.x }
  const dx = point.x - pose.x
  const dy = point.y - pose.y
  const along = dx * direction.x + dy * direction.y
  const across = dx * normal.x + dy * normal.y
  const tolerance = 12 / Math.max(zoom, 0.01)
  const edge = across < 0 ? -NOTEBOOK_RULER_HEIGHT / 2 : NOTEBOOK_RULER_HEIGHT / 2
  if (Math.abs(along) > NOTEBOOK_RULER_LENGTH / 2 + tolerance || Math.abs(across - edge) > tolerance) return null
  return { origin: { x: pose.x + normal.x * edge, y: pose.y + normal.y * edge }, direction }
}

export function projectNotebookRulerPoint<T extends NotebookPointV1>(point: T, guide: NotebookRulerGuide): T {
  const distance = (point.x - guide.origin.x) * guide.direction.x + (point.y - guide.origin.y) * guide.direction.y
  return { ...point, x: guide.origin.x + distance * guide.direction.x, y: guide.origin.y + distance * guide.direction.y }
}
