import { describe, expect, it } from 'vitest'
import {
  appendNotebookPage,
  duplicateNotebookObjects,
  duplicateNotebookPage,
  moveNotebookPage,
  removeNotebookPage,
  setNotebookPagePaper,
  translateNotebookObjects,
} from '../operations'
import { NOTEBOOK_PAGE_LIMIT } from '../types'
import type { NotebookSnapshotV1, NotebookStrokeV1 } from '../types'

function fixture(): NotebookSnapshotV1 {
  const stroke: NotebookStrokeV1 = {
    id: 'stroke-1', kind: 'stroke', actionId: 'action-1', color: '#123abc', width: 4,
    opacity: 1, points: [
      { x: 10, y: 10, pressure: 0, vendor: { preserved: true } },
      { x: 30, y: 30, pressure: 0.8, vendor: { preserved: true } },
    ],
    vendor: { preserved: true },
  }
  return {
    version: 1,
    pages: [
      { id: 'page-1', width: 100, height: 100, paper: { kind: 'plain', vendor: { preserved: true } }, objects: [stroke], vendor: { preserved: true } },
      { id: 'page-2', width: 100, height: 100, paper: { kind: 'ruled' }, objects: [] },
    ],
  }
}

describe('notebook immutable operations', () => {
  it('moves pages without mutating the source and refuses to remove the final page', () => {
    const source = fixture()
    const reordered = moveNotebookPage(source, 'page-2', 0)
    expect(reordered.pages.map(page => page.id)).toEqual(['page-2', 'page-1'])
    expect(source.pages.map(page => page.id)).toEqual(['page-1', 'page-2'])
    expect(removeNotebookPage({ ...source, pages: [source.pages[0]] }, 'page-1').pages).toHaveLength(1)
  })

  it('changes only the page paper and retains unknown page and paper fields', () => {
    const source = fixture()
    const updated = setNotebookPagePaper(source, 'page-1', 'grid')
    expect(updated.pages[0]).toMatchObject({
      vendor: { preserved: true },
      paper: { kind: 'grid', vendor: { preserved: true } },
      objects: source.pages[0].objects,
    })
    expect(source.pages[0].paper.kind).toBe('plain')
  })

  it('duplicates pages with fresh page, object, and action IDs while keeping all unknown data', () => {
    let counter = 0
    const duplicate = duplicateNotebookPage(fixture(), 'page-1', () => `new-${++counter}`)
    expect(duplicate.pages[1]).toMatchObject({
      id: 'new-1', vendor: { preserved: true }, paper: { kind: 'plain', vendor: { preserved: true } },
      objects: [{
        id: 'new-2', actionId: 'new-3', vendor: { preserved: true },
        points: [{ x: 10, y: 10, pressure: 0, vendor: { preserved: true } }, { x: 30, y: 30, pressure: 0.8, vendor: { preserved: true } }],
      }],
    })
  })

  it('duplicates selected objects with fresh IDs and shared action remapping', () => {
    let counter = 0
    const duplicate = duplicateNotebookObjects(fixture(), 'page-1', ['stroke-1'], () => `new-${++counter}`)
    expect(duplicate.pages[0].objects.map(object => object.id)).toEqual(['stroke-1', 'new-1'])
    expect(duplicate.pages[0].objects[1]).toMatchObject({ actionId: 'new-2', vendor: { preserved: true } })
  })

  it('moves selected strokes within page bounds without changing their pressure values', () => {
    const result = translateNotebookObjects(fixture(), 'page-1', ['stroke-1'], 500, 500)
    expect(result.pages[0].objects[0].points).toEqual([
      { x: 78, y: 78, pressure: 0, vendor: { preserved: true } },
      { x: 98, y: 98, pressure: 0.8, vendor: { preserved: true } },
    ])
    expect(fixture().pages[0].objects[0].points[0].x).toBe(10)
  })
})

describe('appendNotebookPage', () => {
  it('appends an empty page sized and papered like the last page', () => {
    const base = fixture()
    const next = appendNotebookPage(base, { id: 'ghost-1' })
    expect(next).not.toBe(base)
    expect(next.pages).toHaveLength(base.pages.length + 1)
    const last = base.pages[base.pages.length - 1]
    expect(next.pages.at(-1)).toEqual({ id: 'ghost-1', width: last.width, height: last.height, paper: last.paper, objects: [] })
    expect(base.pages).toHaveLength(next.pages.length - 1)
  })

  it('honors an explicit paper kind and enforces the page limit', () => {
    const base = fixture()
    expect(appendNotebookPage(base, { id: 'p', paper: 'grid' }).pages.at(-1)!.paper.kind).toBe('grid')
    const full = { ...base, pages: Array.from({ length: NOTEBOOK_PAGE_LIMIT }, (_, index) => ({ ...base.pages[0], id: `page-${index}` })) }
    expect(() => appendNotebookPage(full, { id: 'overflow' })).toThrow()
  })
})
