import { describe, expect, it } from 'vitest'
import { createNotebookExport } from '../export'
import { NOTEBOOK_GRID_SPACING, NOTEBOOK_RULED_SPACING, paperLines } from '../paper'
import { notebookPageSvg } from '../svg'
import type { NotebookPageV1, NotebookSnapshotV1 } from '../types'

const page: NotebookPageV1 = {
  id: 'page-1', width: 595.28, height: 841.89, paper: { kind: 'grid' },
  objects: [{
    id: 'stroke-1', kind: 'stroke', actionId: 'action-1', color: '#ab12cd', width: 6, opacity: 0.7,
    points: [{ x: -10, y: 10, pressure: 0 }, { x: 40, y: 20, pressure: 1 }],
  }],
}

describe('notebook paper and vector rendering', () => {
  it('uses 5 mm grid spacing and 8 mm ruled spacing expressed in page points', () => {
    expect(paperLines('grid', 595.28, 841.89)[0].x1).toBeCloseTo(NOTEBOOK_GRID_SPACING)
    expect(paperLines('grid', 595.28, 841.89).some(line => line.y1 === NOTEBOOK_GRID_SPACING)).toBe(true)
    expect(paperLines('ruled', 595.28, 841.89).some(line => line.y1 === NOTEBOOK_RULED_SPACING)).toBe(true)
    expect(paperLines('plain', 100, 100)).toEqual([])
    expect(paperLines('grid', Number.MAX_VALUE, 841.89)).toEqual([])
  })

  it('clips a safe native SVG stroke to the page and escapes or excludes untrusted markup', () => {
    const svg = notebookPageSvg({ ...page, id: '<script>' })
    expect(svg).toContain('clipPath')
    expect(svg).toContain('width="595.28"')
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('Z')
    expect(notebookPageSvg(page, false)).not.toContain('notebook-paper')
  })

  it('exports typed pressure-derived vector paths in page and object order, including blank pages', () => {
    const snapshot: NotebookSnapshotV1 = { version: 1, pages: [page, { ...page, id: 'blank', objects: [] }] }
    const result = createNotebookExport(snapshot, false)
    expect(result.pages).toHaveLength(2)
    expect(result.pages[0]).toMatchObject({
      width: 595.28, height: 841.89, paper: { kind: 'grid', lines: [] },
      paths: [{ id: 'stroke-1', actionId: 'action-1', color: '#ab12cd', opacity: 0.7 }],
    })
    expect(result.pages[0].paths[0].commands[0]).toMatchObject({ type: 'M' })
    expect(result.pages[0].paths[0].commands.at(-1)).toEqual({ type: 'Z' })
    expect(result.pages[1].paths).toEqual([])
  })
})
