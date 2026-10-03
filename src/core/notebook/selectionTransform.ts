import { clampNotebookTranslation, notebookObjectMargin } from './geometry'
import { isNotebookStroke } from './types'
import type { NotebookObjectV1, NotebookPageV1, NotebookStrokeV1 } from './types'

export interface NotebookSelectionTransform {
  scale?: number
  angle?: number
  dx?: number
  dy?: number
}

export interface NotebookSelectionBounds { x: number; y: number; width: number; height: number }

export function notebookSelectionBounds(objects: readonly NotebookObjectV1[]): NotebookSelectionBounds | null {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const object of objects) {
    const margin = notebookObjectMargin(object)
    for (const point of object.points) {
      left = Math.min(left, point.x - margin)
      top = Math.min(top, point.y - margin)
      right = Math.max(right, point.x + margin)
      bottom = Math.max(bottom, point.y + margin)
    }
  }
  return Number.isFinite(left) ? { x: left, y: top, width: right - left, height: bottom - top } : null
}

export type NotebookFlipAxis = 'horizontal' | 'vertical'

/**
 * Mirrors the selection through the center of its bounds: `horizontal` swaps
 * left and right, `vertical` swaps top and bottom. The whole selection is one
 * mirror, so arrows and checkpoint-split strokes stay intact and the bounds (and
 * therefore the page fit) are unchanged. Image corners are mirrored too, which
 * flips the picture itself; point order, pressure and unknown fields are kept.
 */
export function flipNotebookSelection(page: NotebookPageV1, ids: readonly string[], axis: NotebookFlipAxis): NotebookPageV1 {
  const selected = new Set(ids)
  const bounds = notebookSelectionBounds(page.objects.filter(object => selected.has(object.id)))
  if (!bounds) return page
  const center = axis === 'horizontal' ? bounds.x + bounds.width / 2 : bounds.y + bounds.height / 2
  return {
    ...page,
    objects: page.objects.map(object => selected.has(object.id)
      ? {
          ...object,
          points: object.points.map(point => axis === 'horizontal'
            ? { ...point, x: 2 * center - point.x }
            : { ...point, y: 2 * center - point.y }),
        }
      : object),
  }
}

export function transformNotebookSelection(
  page: NotebookPageV1,
  ids: readonly string[],
  transform: NotebookSelectionTransform,
): NotebookPageV1 {
  const { scale = 1, angle = 0, dx = 0, dy = 0 } = transform
  if (![scale, angle, dx, dy].every(Number.isFinite) || scale <= 0
    || (scale === 1 && angle % 360 === 0 && dx === 0 && dy === 0)) return page
  const selected = new Set(ids)
  const objects = page.objects.filter(object => selected.has(object.id))
  const bounds = notebookSelectionBounds(objects)
  if (!bounds) return page
  if (scale === 1 && angle % 360 === 0) {
    const translation = clampNotebookTranslation(objects, dx, dy, page.width, page.height)
    if (translation.dx === 0 && translation.dy === 0) return page
    return { ...page, objects: page.objects.map(object => selected.has(object.id)
      ? { ...object, points: object.points.map(point => ({ ...point, x: point.x + translation.dx, y: point.y + translation.dy })) }
      : object) }
  }
  const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2
  const radians = (angle % 360) * Math.PI / 180
  const cos = Math.cos(radians), sin = Math.sin(radians)
  const rotated = objects.map(object => {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for (const point of object.points) {
      const x = (point.x - cx) * cos - (point.y - cy) * sin
      const y = (point.x - cx) * sin + (point.y - cy) * cos
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
    return { object, left, right, top, bottom }
  })
  const widthAt = (object: NotebookStrokeV1, factor: number) => object.kind === 'highlighter'
    ? Math.max(2, Math.min(24, object.width * factor))
    : Math.max(.25, Math.min(8, object.width * factor))
  function fits(factor: number): boolean {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
    for (const item of rotated) {
      const margin = isNotebookStroke(item.object) ? widthAt(item.object, factor) / 2 : 0
      left = Math.min(left, item.left * factor - margin)
      right = Math.max(right, item.right * factor + margin)
      top = Math.min(top, item.top * factor - margin)
      bottom = Math.max(bottom, item.bottom * factor + margin)
    }
    return right - left <= page.width && bottom - top <= page.height
  }
  let factor = Math.max(.05, Math.min(20, scale))
  // Fit the group uniformly; clamping individual points would deform closed shapes.
  if (!fits(factor)) {
    let low = 0, high = factor
    for (let i = 0; i < 40; i++) {
      const middle = (low + high) / 2
      if (fits(middle)) low = middle
      else high = middle
    }
    factor = low
  }
  const transformed = objects.map((object): NotebookObjectV1 => ({
    ...object,
    ...(isNotebookStroke(object) ? { width: widthAt(object, factor) } : {}),
    points: object.points.map(point => ({
      ...point,
      x: cx + ((point.x - cx) * cos - (point.y - cy) * sin) * factor,
      y: cy + ((point.x - cx) * sin + (point.y - cy) * cos) * factor,
    })),
  }))
  const translation = clampNotebookTranslation(transformed, dx, dy, page.width, page.height)
  const replacements = new Map(transformed.map(object => [object.id, {
    ...object,
    points: translation.dx || translation.dy
      ? object.points.map(point => ({ ...point, x: point.x + translation.dx, y: point.y + translation.dy }))
      : object.points,
  }]))
  return { ...page, objects: page.objects.map(object => replacements.get(object.id) ?? object) }
}
