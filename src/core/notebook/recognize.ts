import { notebookShapePoints } from './shape'
import type { NotebookPointV1 } from './types'

export type NotebookRecognizedShape = 'line' | 'triangle' | 'rectangle' | 'quadrilateral' | 'ellipse' | 'circle'
export interface NotebookRecognition { shape: NotebookRecognizedShape; points: NotebookPointV1[] }

/** Smallest bounding-box diagonal, in page points, that is considered a shape. */
export const NOTEBOOK_RECOGNITION_MIN_SIZE = 12

const CLOSED_CHORD_RATIO = 0.25
const POLYGON_EPSILON_RATIO = 0.08
const MERGE_DISTANCE_RATIO = 0.1
const MIN_TURN_RADIANS = (30 * Math.PI) / 180
const POLYGON_ERROR_LIMIT = 0.04
const AXIS_TOLERANCE_RADIANS = (12 * Math.PI) / 180
const ELLIPSE_ERROR_LIMIT = 0.1
const CIRCLE_ASPECT = 0.85

type Point = NotebookPointV1

const pt = (x: number, y: number): Point => ({ x, y, pressure: 0.5 })
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared))
  return Math.hypot(p.x - (a.x + ratio * dx), p.y - (a.y + ratio * dy))
}

function pathLength(points: readonly Point[]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) total += dist(points[index - 1], points[index])
  return total
}

function douglasPeucker(chain: readonly Point[], epsilon: number): Point[] {
  if (chain.length < 3) return [...chain]
  const first = chain[0]
  const last = chain[chain.length - 1]
  let farthest = 0
  let farthestIndex = -1
  for (let index = 1; index < chain.length - 1; index += 1) {
    const distance = distanceToSegment(chain[index], first, last)
    if (distance > farthest) { farthest = distance; farthestIndex = index }
  }
  if (farthestIndex < 0 || farthest <= epsilon) return [first, last]
  const left = douglasPeucker(chain.slice(0, farthestIndex + 1), epsilon)
  const right = douglasPeucker(chain.slice(farthestIndex), epsilon)
  return [...left.slice(0, -1), ...right]
}

function closedDouglasPeucker(points: readonly Point[], epsilon: number): Point[] {
  const start = points[0]
  let splitIndex = 0
  let splitDistance = 0
  points.forEach((point, index) => {
    const distance = dist(point, start)
    if (distance > splitDistance) { splitDistance = distance; splitIndex = index }
  })
  if (splitIndex === 0) return []
  const first = douglasPeucker(points.slice(0, splitIndex + 1), epsilon)
  const second = douglasPeucker([...points.slice(splitIndex), start], epsilon)
  return [...first.slice(0, -1), ...second.slice(0, -1)]
}

function turningAngle(prev: Point, vertex: Point, next: Point): number {
  const before = Math.atan2(vertex.y - prev.y, vertex.x - prev.x)
  const after = Math.atan2(next.y - vertex.y, next.x - vertex.x)
  const delta = Math.abs(after - before)
  return Math.min(delta, Math.PI * 2 - delta)
}

function cleanPolygon(vertices: Point[], diag: number): Point[] {
  const polygon = [...vertices]
  let changed = true
  while (changed && polygon.length >= 3) {
    changed = false
    for (let index = 0; index < polygon.length; index += 1) {
      if (dist(polygon[index], polygon[(index + 1) % polygon.length]) < MERGE_DISTANCE_RATIO * diag) {
        polygon.splice((index + 1) % polygon.length, 1)
        changed = true
        break
      }
    }
    if (changed) continue
    for (let index = 0; index < polygon.length; index += 1) {
      const prev = polygon[(index - 1 + polygon.length) % polygon.length]
      const next = polygon[(index + 1) % polygon.length]
      if (turningAngle(prev, polygon[index], next) < MIN_TURN_RADIANS) {
        polygon.splice(index, 1)
        changed = true
        break
      }
    }
  }
  return polygon
}

function polygonError(points: readonly Point[], polygon: readonly Point[], diag: number): number {
  let total = 0
  for (const point of points) {
    let nearest = Number.POSITIVE_INFINITY
    for (let index = 0; index < polygon.length; index += 1) {
      nearest = Math.min(nearest, distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]))
    }
    total += nearest
  }
  return total / points.length / diag
}

function isAxisAligned(polygon: readonly Point[]): boolean {
  return polygon.every((vertex, index) => {
    const next = polygon[(index + 1) % polygon.length]
    const angle = Math.abs(Math.atan2(next.y - vertex.y, next.x - vertex.x)) % (Math.PI / 2)
    return Math.min(angle, Math.PI / 2 - angle) <= AXIS_TOLERANCE_RADIANS
  })
}

function recognizePolygon(
  points: readonly Point[],
  box: { minX: number; minY: number; maxX: number; maxY: number },
  diag: number,
): NotebookRecognition | null {
  const vertices = closedDouglasPeucker(points, POLYGON_EPSILON_RATIO * diag)
  const polygon = cleanPolygon(vertices, diag)
  if (polygon.length !== 3 && polygon.length !== 4) return null
  if (polygonError(points, polygon, diag) > POLYGON_ERROR_LIMIT) return null
  if (polygon.length === 3) return { shape: 'triangle', points: [...polygon.map(v => pt(v.x, v.y)), pt(polygon[0].x, polygon[0].y)] }
  if (isAxisAligned(polygon)) {
    return { shape: 'rectangle', points: notebookShapePoints([pt(box.minX, box.minY), pt(box.maxX, box.maxY)], 'rectangle') }
  }
  return { shape: 'quadrilateral', points: [...polygon.map(v => pt(v.x, v.y)), pt(polygon[0].x, polygon[0].y)] }
}

function recognizeEllipse(
  points: readonly Point[],
  box: { minX: number; minY: number; maxX: number; maxY: number },
  length: number,
): NotebookRecognition | null {
  const rx = (box.maxX - box.minX) / 2
  const ry = (box.maxY - box.minY) / 2
  if (rx < NOTEBOOK_RECOGNITION_MIN_SIZE / 4 || ry < NOTEBOOK_RECOGNITION_MIN_SIZE / 4) return null
  const cx = (box.minX + box.maxX) / 2
  const cy = (box.minY + box.maxY) / 2
  const error = points.reduce((sum, p) => sum + Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1), 0) / points.length
  const perimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
  if (error > ELLIPSE_ERROR_LIMIT || length < 0.75 * perimeter) return null
  if (Math.min(rx, ry) / Math.max(rx, ry) >= CIRCLE_ASPECT) {
    const r = (rx + ry) / 2
    return { shape: 'circle', points: notebookShapePoints([pt(cx - r, cy - r), pt(cx + r, cy + r)], 'ellipse') }
  }
  return { shape: 'ellipse', points: notebookShapePoints([pt(box.minX, box.minY), pt(box.maxX, box.maxY)], 'ellipse') }
}

/**
 * Drops an overshoot past the start of a closed gesture: in the second half of
 * the path, cuts after the point nearest the start so the loop closes there.
 */
function trimClosingTail(points: readonly Point[]): Point[] {
  const start = points[0]
  let cut = points.length - 1
  for (let index = Math.floor(points.length / 2); index < points.length; index += 1) {
    if (dist(points[index], start) < dist(points[cut], start)) cut = index
  }
  return points.slice(0, cut + 1)
}

function boundsOf(points: readonly Point[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
  for (const p of points) {
    box.minX = Math.min(box.minX, p.x)
    box.minY = Math.min(box.minY, p.y)
    box.maxX = Math.max(box.maxX, p.x)
    box.maxY = Math.max(box.maxY, p.y)
  }
  return box
}

/** Turns a freehand gesture into a clean line, polygon, or ellipse, or returns null when it is not clearly one. */
export function recognizeNotebookShape(input: readonly NotebookPointV1[]): NotebookRecognition | null {
  if (input.length < 2 || input.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null
  const points: Point[] = []
  for (const p of input) {
    const previous = points[points.length - 1]
    if (!previous || previous.x !== p.x || previous.y !== p.y) points.push(p)
  }
  if (points.length < 2) return null
  const box = boundsOf(points)
  const diag = Math.hypot(box.maxX - box.minX, box.maxY - box.minY)
  if (diag < NOTEBOOK_RECOGNITION_MIN_SIZE) return null
  const start = points[0]
  const end = points[points.length - 1]
  const loop = trimClosingTail(points)
  if (dist(start, loop[loop.length - 1]) > CLOSED_CHORD_RATIO * diag) {
    const chord = dist(start, end)
    const tolerance = Math.max(2, 0.05 * chord)
    const straight = points.every(p => distanceToSegment(p, start, end) <= tolerance) && pathLength(points) <= 1.15 * chord
    return straight ? { shape: 'line', points: [pt(start.x, start.y), pt(end.x, end.y)] } : null
  }
  const loopBox = boundsOf(loop)
  const loopDiag = Math.hypot(loopBox.maxX - loopBox.minX, loopBox.maxY - loopBox.minY)
  if (loop.length < 3 || loopDiag < NOTEBOOK_RECOGNITION_MIN_SIZE) return null
  return recognizePolygon(loop, loopBox, loopDiag) ?? recognizeEllipse(loop, loopBox, pathLength(loop))
}
