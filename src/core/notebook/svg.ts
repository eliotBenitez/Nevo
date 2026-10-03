import { notebookOutlinePathData, notebookStrokeOutlines } from './geometry'
import { formatNotebookNumber } from './format'
import { NOTEBOOK_PAPER_LINE_COLOR, NOTEBOOK_PAPER_LINE_WIDTH, paperLines } from './paper'
import { isNotebookStroke, type NotebookPageV1 } from './types'

const WHITE = '#ffffff'
const IMAGE_PLACEHOLDER_FILL = '#eeeeee'
const IMAGE_PLACEHOLDER_STROKE = '#b5b5b5'

export function notebookPageSvg(page: NotebookPageV1, includePaper = true): string {
  if (!Number.isFinite(page.width) || page.width <= 0 || !Number.isFinite(page.height) || page.height <= 0) {
    throw new RangeError('Notebook page dimensions must be finite and positive.')
  }
  const safeWidth = formatNotebookNumber(page.width)
  const safeHeight = formatNotebookNumber(page.height)
  const clipId = `notebook-page-clip-${hashId(page.id)}`
  const paper = includePaper
    ? paperLines(page.paper.kind, page.width, page.height).map(line =>
      `<path class="notebook-paper" d="M ${formatNotebookNumber(line.x1)} ${formatNotebookNumber(line.y1)} L ${formatNotebookNumber(line.x2)} ${formatNotebookNumber(line.y2)}" fill="none" stroke="${NOTEBOOK_PAPER_LINE_COLOR}" stroke-width="${formatNotebookNumber(NOTEBOOK_PAPER_LINE_WIDTH)}"/>`,
    ).join('')
    : ''
  const strokes = page.objects.map(stroke => {
    if (!isNotebookStroke(stroke)) return imagePlaceholder(stroke.points, stroke.opacity)
    if (!/^#[0-9a-fA-F]{6}$/.test(stroke.color)) throw new TypeError('Notebook stroke color must be a six-digit hex color.')
    if (!Number.isFinite(stroke.opacity) || stroke.opacity < 0 || stroke.opacity > 1) throw new RangeError('Notebook stroke opacity must be between zero and one.')
    const color = stroke.color
    const opacity = formatNotebookNumber(stroke.opacity)
    return notebookStrokeOutlines(stroke.points, stroke.width, stroke.kind === 'highlighter', stroke.dash, stroke.path === 'modeled')
      .map(commands => `<path d="${notebookOutlinePathData(commands)}" fill="${color}" opacity="${opacity}"/>`)
      .join('')
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}"><defs><clipPath id="${xml(clipId)}"><rect width="${safeWidth}" height="${safeHeight}"/></clipPath></defs><rect width="${safeWidth}" height="${safeHeight}" fill="${WHITE}"/><g clip-path="url(#${xml(clipId)})">${paper}${strokes}</g></svg>`
}

/** History previews render as an `<img>` data URI, which cannot load workspace files. */
function imagePlaceholder(points: readonly { x: number; y: number }[], opacity: number): string {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1) throw new RangeError('Notebook image opacity must be between zero and one.')
  const data = points.map(point => `${formatNotebookNumber(point.x)},${formatNotebookNumber(point.y)}`).join(' ')
  return `<polygon class="notebook-image-placeholder" points="${data}" fill="${IMAGE_PLACEHOLDER_FILL}" stroke="${IMAGE_PLACEHOLDER_STROKE}" stroke-width="1" opacity="${formatNotebookNumber(opacity)}"/>`
}

function xml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;')
}

function hashId(value: string): string {
  let first = 2_166_136_261
  let second = 2_246_822_519
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    first = Math.imul(first ^ code, 16_777_619)
    second = Math.imul(second ^ code, 32_668_489)
  }
  return `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`
}
