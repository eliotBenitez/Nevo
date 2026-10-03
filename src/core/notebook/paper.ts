import type { NotebookPaperKind, NotebookPaperLine } from './types'

export const NOTEBOOK_MM_TO_PT = 72 / 25.4
export const NOTEBOOK_GRID_SPACING = 5 * NOTEBOOK_MM_TO_PT
export const NOTEBOOK_RULED_SPACING = 8 * NOTEBOOK_MM_TO_PT
const MAX_PAPER_LINES = 20_000
export const NOTEBOOK_PAPER_LINE_COLOR = '#e6e6e6'
export const NOTEBOOK_PAPER_LINE_WIDTH = 0.5

export function paperLines(kind: NotebookPaperKind, width: number, height: number): NotebookPaperLine[] {
  if (kind === 'plain' || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return []
  const spacing = kind === 'grid' ? NOTEBOOK_GRID_SPACING : NOTEBOOK_RULED_SPACING
  const verticalCount = kind === 'grid' ? Math.max(0, Math.ceil(width / NOTEBOOK_GRID_SPACING) - 1) : 0
  const horizontalCount = Math.max(0, Math.ceil(height / spacing) - 1)
  if (verticalCount + horizontalCount > MAX_PAPER_LINES) return []
  const lines: NotebookPaperLine[] = []
  if (kind === 'grid') {
    for (let index = 1; index <= verticalCount; index += 1) {
      const x = index * NOTEBOOK_GRID_SPACING
      lines.push({ x1: x, y1: 0, x2: x, y2: height })
    }
  }
  for (let index = 1; index <= horizontalCount; index += 1) {
    const y = index * spacing
    lines.push({ x1: 0, y1: y, x2: width, y2: y })
  }
  return lines
}
