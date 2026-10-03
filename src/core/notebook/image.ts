import type { NotebookPointV1 } from './types'

const IMAGE_SRC = /^\.nevo\/assets\/([^/\\]+)$/
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])
const FIT_RATIO = 0.6

export type NotebookImageMatrix = [number, number, number, number, number, number]

/** Mirrors the backend rule: one `.nevo/assets/<name>` segment with a raster extension. */
export function isNotebookImageSrc(src: unknown): src is string {
  if (typeof src !== 'string') return false
  const match = IMAGE_SRC.exec(src)
  if (!match) return false
  const name = match[1]
  if (name === '.' || name === '..') return false
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return false
  return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase())
}

/** Corners in TL, TR, BR, BL order of an axis-aligned rectangle. */
export function notebookImageCorners(
  center: { x: number; y: number },
  width: number,
  height: number,
): NotebookPointV1[] {
  const left = center.x - width / 2
  const top = center.y - height / 2
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ]
}

export function fitNotebookImage(
  natural: { width: number; height: number },
  page: { width: number; height: number },
): NotebookPointV1[] {
  const sourceWidth = Number.isFinite(natural.width) && natural.width > 0 ? natural.width : 1
  const sourceHeight = Number.isFinite(natural.height) && natural.height > 0 ? natural.height : 1
  const scale = Math.min((page.width * FIT_RATIO) / sourceWidth, (page.height * FIT_RATIO) / sourceHeight)
  return notebookImageCorners(
    { x: page.width / 2, y: page.height / 2 },
    sourceWidth * scale,
    sourceHeight * scale,
  )
}

/** SVG `matrix(a b c d e f)` mapping the unit square onto the quad TL, TR, BR, BL. */
export function notebookImageMatrix(points: readonly NotebookPointV1[]): NotebookImageMatrix {
  const [topLeft, topRight, , bottomLeft] = points
  return [
    topRight.x - topLeft.x,
    topRight.y - topLeft.y,
    bottomLeft.x - topLeft.x,
    bottomLeft.y - topLeft.y,
    topLeft.x,
    topLeft.y,
  ]
}

export function notebookQuadArea(points: readonly NotebookPointV1[]): number {
  let sum = 0
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length]
    sum += points[index].x * next.y - next.x * points[index].y
  }
  return Math.abs(sum) / 2
}
