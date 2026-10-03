import getStroke from 'perfect-freehand'
import { eraseStrokeSegments } from '../canvas/eraser'
import type { CanvasPoint } from '../canvas/types'
import { createNotebookId } from './codec'
import { formatNotebookNumber } from './format'
import { notebookLineSegments } from './line'
import { closedNotebookStrokeContours, closedNotebookStrokeOutline } from './closedStroke'
import { isNotebookStroke } from './types'
import type { NotebookIdFactory, NotebookLineStyle, NotebookObjectV1, NotebookPathCommand, NotebookPointV1, NotebookStrokeV1 } from './types'

/** Half the ink width for strokes; images have no stroke margin. */
export function notebookObjectMargin(object: NotebookObjectV1): number {
  return isNotebookStroke(object) ? object.width / 2 : 0
}

export function notebookStrokeOutline(
  points: readonly NotebookPointV1[],
  width: number,
  highlighter = false,
  modeled = false,
): NotebookPathCommand[] {
  if (!points.length || !Number.isFinite(width) || width <= 0) return []
  const closed = highlighter ? null : closedNotebookStrokeOutline(points, width)
  if (closed) return closed
  const outline = outlinePoints(points, width, highlighter, modeled)
  if (!outline.length) return []
  const commands: NotebookPathCommand[] = [{ type: 'M', x: outline[0][0], y: outline[0][1] }]
  for (let index = 1; index < outline.length; index += 1) {
    const [x, y] = outline[index]
    const [previousX, previousY] = outline[index - 1]
    commands.push({ type: 'Q', cx: previousX, cy: previousY, x: (previousX + x) / 2, y: (previousY + y) / 2 })
  }
  const [lastX, lastY] = outline[outline.length - 1]
  commands.push({ type: 'L', x: lastX, y: lastY }, { type: 'Z' })
  return commands
}

/**
 * Closed outlines that make up a stored stroke. Ordinary pen/marker strokes
 * produce a single outline; the straight-line tool with a dash style produces
 * one closed mark per dash or dot so the UI, SVG export and PDF share geometry.
 */
export function notebookStrokeOutlines(
  points: readonly NotebookPointV1[],
  width: number,
  highlighter = false,
  dash?: NotebookLineStyle,
  modeled = false,
): NotebookPathCommand[][] {
  if (dash && dash !== 'solid') {
    return notebookLineSegments(points, width, dash)
      .map(segment => notebookStrokeOutline(segment, width, false))
      .filter(outline => outline.length > 0)
  }
  const outline = notebookStrokeOutline(points, width, highlighter, modeled)
  return outline.length ? [outline] : []
}

export function notebookOutlinePathData(commands: readonly NotebookPathCommand[]): string {
  return commands.map(command => {
    if (command.type === 'M' || command.type === 'L') return `${command.type} ${formatNotebookNumber(command.x)},${formatNotebookNumber(command.y)}`
    if (command.type === 'Q') return `Q ${formatNotebookNumber(command.cx)},${formatNotebookNumber(command.cy)} ${formatNotebookNumber(command.x)},${formatNotebookNumber(command.y)}`
    return 'Z'
  }).join(' ')
}

export function notebookStrokeOutlinePath(
  points: readonly NotebookPointV1[],
  width: number,
  highlighter = false,
  modeled = false,
): string {
  return notebookOutlinePathData(notebookStrokeOutline(points, width, highlighter, modeled))
}

/** Path data for every mark of a stored stroke, joined for a single SVG path element. */
export function notebookStrokeOutlineData(
  points: readonly NotebookPointV1[],
  width: number,
  highlighter = false,
  dash?: NotebookLineStyle,
  modeled = false,
): string {
  return notebookStrokeOutlines(points, width, highlighter, dash, modeled).map(notebookOutlinePathData).join(' ')
}

export function eraseNotebookStroke(
  stroke: NotebookStrokeV1,
  eraserPoints: readonly NotebookPointV1[],
  radius: number,
  createId: NotebookIdFactory = createNotebookId,
): NotebookStrokeV1[] {
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Notebook eraser radius must be finite and non-negative.')
  if (stroke.points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))
    || eraserPoints.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    throw new RangeError('Notebook eraser geometry must be finite.')
  }
  if (stroke.points.length === 1) {
    const point = stroke.points[0]
    return distanceToPath(point, eraserPoints) <= Math.max(0, radius) + stroke.width * (point.pressure ?? 0.5) / 2
      ? []
      : [stroke]
  }
  const pieces = eraseStrokeSegments(
    toCanvasPoints(stroke.points),
    toCanvasPoints(eraserPoints),
    Math.max(0, radius) + stroke.width / 2,
  )
  if (pieces.length === 1 && pieces[0].length === stroke.points.length
    && pieces[0].every((point, index) => point.x === stroke.points[index].x && point.y === stroke.points[index].y)) return [stroke]
  let sourceIndex = 0
  return pieces.map(points => ({
    ...stroke,
    id: createId(),
    points: points.map((point) => {
      sourceIndex = findNearestSourceIndex(point, stroke.points, sourceIndex)
      const source = stroke.points[sourceIndex]
      return { ...pointMetadata(source), ...point }
    }),
  }))
}

/**
 * Removes every stroke touched by the eraser, together with all other objects
 * of the same drawn action (arrow heads, checkpoint segments, erased pieces).
 * Kept objects retain their identity; the contents are returned unchanged
 * when nothing is hit. Images are never touched by the eraser.
 */
export function eraseWholeNotebookStrokes(
  objects: readonly NotebookObjectV1[],
  eraserPoints: readonly NotebookPointV1[],
  radius: number,
): NotebookObjectV1[] {
  if (!Number.isFinite(radius) || radius < 0) throw new RangeError('Notebook eraser radius must be finite and non-negative.')
  if (!eraserPoints.length) return [...objects]
  const eraserBox = pointsBox(eraserPoints)
  const hitActions = new Set<string>()
  for (const object of objects) {
    if (!isNotebookStroke(object) || !object.points.length) continue
    const limit = radius + object.width / 2
    const box = pointsBox(object.points)
    if (box.maxX + limit < eraserBox.minX || box.minX - limit > eraserBox.maxX
      || box.maxY + limit < eraserBox.minY || box.minY - limit > eraserBox.maxY) continue
    if (pathsWithin(object.points, eraserPoints, limit)) hitActions.add(object.actionId)
  }
  if (!hitActions.size) return [...objects]
  return objects.filter(object => !isNotebookStroke(object) || !hitActions.has(object.actionId))
}

export function lassoSelectNotebookObjects(
  objects: readonly NotebookObjectV1[],
  polygon: readonly NotebookPointV1[],
): string[] {
  if (polygon.length < 3) return []
  return objects.filter(object => {
    if (!isNotebookStroke(object)) return polygonsIntersect(object.points, polygon)
    const contours = object.kind === 'stroke' ? closedNotebookStrokeContours(object.points, object.width) : null
    if (contours) {
      if (polygon.some(point => pointInPolygon(point, contours[0])
        && (!contours[1] || !pointInPolygon(point, contours[1])))) return true
      return contours.some(contour => contour.some(point => pointInPolygon(point, polygon))
        || contour.some((point, index) => polygon.some((other, otherIndex) => segmentsIntersect(
          point, contour[(index + 1) % contour.length], other, polygon[(otherIndex + 1) % polygon.length],
        ))))
    }
    return polygonsIntersect(outlinePoints(object.points, object.width, object.kind === 'highlighter', object.path === 'modeled')
      .map(([x, y]) => ({ x, y })), polygon)
  }).map(object => object.id)
}

export function translateNotebookStroke(
  stroke: NotebookStrokeV1,
  dx: number,
  dy: number,
  pageWidth: number,
  pageHeight: number,
): NotebookStrokeV1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return stroke
  const margin = stroke.width / 2
  const xs = stroke.points.map(point => point.x)
  const ys = stroke.points.map(point => point.y)
  const minDx = margin - Math.min(...xs)
  const maxDx = pageWidth - margin - Math.max(...xs)
  const minDy = margin - Math.min(...ys)
  const maxDy = pageHeight - margin - Math.max(...ys)
  const safeDx = clampTranslation(dx, minDx, maxDx)
  const safeDy = clampTranslation(dy, minDy, maxDy)
  if (safeDx === 0 && safeDy === 0) return stroke
  return { ...stroke, points: stroke.points.map(point => ({ ...point, x: point.x + safeDx, y: point.y + safeDy })) }
}

export function clampNotebookTranslation(
  objects: readonly NotebookObjectV1[],
  dx: number,
  dy: number,
  pageWidth: number,
  pageHeight: number,
): { dx: number; dy: number } {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { dx: 0, dy: 0 }
  let minDx = Number.NEGATIVE_INFINITY
  let maxDx = Number.POSITIVE_INFINITY
  let minDy = Number.NEGATIVE_INFINITY
  let maxDy = Number.POSITIVE_INFINITY
  let pointCount = 0
  for (const object of objects) {
    const margin = notebookObjectMargin(object)
    for (const point of object.points) {
      pointCount += 1
      minDx = Math.max(minDx, margin - point.x)
      maxDx = Math.min(maxDx, pageWidth - margin - point.x)
      minDy = Math.max(minDy, margin - point.y)
      maxDy = Math.min(maxDy, pageHeight - margin - point.y)
    }
  }
  if (!pointCount) return { dx: 0, dy: 0 }
  return { dx: clampTranslation(dx, minDx, maxDx), dy: clampTranslation(dy, minDy, maxDy) }
}

/**
 * Modeled strokes already carry a smoothed, resampled trajectory, so the
 * lagging `streamline` filter is dropped and the contour ends exactly on the
 * last point. Legacy strokes keep the original options.
 */
export const LEGACY_STROKE_OPTIONS = { smoothing: 0.5, streamline: 0.5 } as const
export const MODELED_STROKE_OPTIONS = { smoothing: 0.2, streamline: 0 } as const

function outlinePoints(
  points: readonly NotebookPointV1[],
  width: number,
  highlighter: boolean,
  modeled = false,
): [number, number][] {
  return getStroke(points.map(point => [point.x, point.y, highlighter ? 0.5 : point.pressure ?? 0.5]), {
    size: width,
    thinning: highlighter ? 0 : 0.6,
    ...(modeled ? MODELED_STROKE_OPTIONS : LEGACY_STROKE_OPTIONS),
    simulatePressure: false,
    // Two-point segments must meet at their endpoints, including arrow tips.
    last: modeled || points.length === 2,
  })
}

function toCanvasPoints(points: readonly NotebookPointV1[]): CanvasPoint[] {
  return points.map(point => ({ x: point.x, y: point.y, ...(point.pressure === undefined ? {} : { pressure: point.pressure }) }))
}

function pointMetadata(source: NotebookPointV1): Record<string, unknown> {
  return Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'x' && key !== 'y' && key !== 'pressure'))
}

function findNearestSourceIndex(point: CanvasPoint, source: readonly NotebookPointV1[], start: number): number {
  let index = Math.min(start, source.length - 1)
  let distance = pointDistanceSquared(point, source[index])
  while (index + 1 < source.length) {
    const nextDistance = pointDistanceSquared(point, source[index + 1])
    if (nextDistance > distance) break
    index += 1
    distance = nextDistance
  }
  return index
}

function pointDistanceSquared(left: CanvasPoint, right: NotebookPointV1): number {
  const x = left.x - right.x
  const y = left.y - right.y
  return x * x + y * y
}

function distanceToPath(point: NotebookPointV1, path: readonly NotebookPointV1[]): number {
  if (!path.length) return Number.POSITIVE_INFINITY
  if (path.length === 1) return Math.hypot(point.x - path[0].x, point.y - path[0].y)
  let nearest = Number.POSITIVE_INFINITY
  for (let index = 1; index < path.length; index += 1) {
    const from = path[index - 1]
    const to = path[index]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const lengthSquared = dx * dx + dy * dy
    const ratio = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared))
    nearest = Math.min(nearest, Math.hypot(point.x - (from.x + ratio * dx), point.y - (from.y + ratio * dy)))
  }
  return nearest
}

function pointsBox(points: readonly NotebookPointV1[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }
  return { minX, minY, maxX, maxY }
}

function pathsWithin(left: readonly NotebookPointV1[], right: readonly NotebookPointV1[], limit: number): boolean {
  const segments = (path: readonly NotebookPointV1[]) => path.length === 1
    ? [[path[0], path[0]] as const]
    : path.slice(1).map((point, index) => [path[index], point] as const)
  const rightSegments = segments(right)
  for (const [a, b] of segments(left)) {
    for (const [c, d] of rightSegments) {
      if (segmentsIntersect(a, b, c, d)) return true
      if (Math.min(distanceToPath(a, [c, d]), distanceToPath(b, [c, d]), distanceToPath(c, [a, b]), distanceToPath(d, [a, b])) <= limit) return true
    }
  }
  return false
}

function polygonsIntersect(outline: readonly NotebookPointV1[], polygon: readonly NotebookPointV1[]): boolean {
  if (outline.length < 3) return false
  if (outline.some(point => pointInPolygon(point, polygon)) || polygon.some(point => pointInPolygon(point, outline))) return true
  for (let left = 0; left < outline.length; left += 1) {
    const nextLeft = (left + 1) % outline.length
    for (let right = 0; right < polygon.length; right += 1) {
      const nextRight = (right + 1) % polygon.length
      if (segmentsIntersect(outline[left], outline[nextLeft], polygon[right], polygon[nextRight])) return true
    }
  }
  return false
}

function pointInPolygon(point: NotebookPointV1, polygon: readonly NotebookPointV1[]): boolean {
  let inside = false
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index]
    const prior = polygon[previous]
    if ((current.y > point.y) !== (prior.y > point.y)
      && point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y) + current.x) inside = !inside
  }
  return inside
}

function segmentsIntersect(a: NotebookPointV1, b: NotebookPointV1, c: NotebookPointV1, d: NotebookPointV1): boolean {
  const orient = (p: NotebookPointV1, q: NotebookPointV1, r: NotebookPointV1) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const onSegment = (p: NotebookPointV1, q: NotebookPointV1, r: NotebookPointV1) =>
    q.x >= Math.min(p.x, r.x) && q.x <= Math.max(p.x, r.x)
    && q.y >= Math.min(p.y, r.y) && q.y <= Math.max(p.y, r.y)
  const o1 = orient(a, b, c)
  const o2 = orient(a, b, d)
  const o3 = orient(c, d, a)
  const o4 = orient(c, d, b)
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return true
  return (o1 === 0 && onSegment(a, c, b)) || (o2 === 0 && onSegment(a, d, b))
    || (o3 === 0 && onSegment(c, a, d)) || (o4 === 0 && onSegment(c, b, d))
}

function clampTranslation(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2
  return Math.min(max, Math.max(min, value))
}
