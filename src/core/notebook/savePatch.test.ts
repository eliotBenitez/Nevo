import { describe, expect, it } from 'vitest'
import { createNotebook } from './codec'
import type { NoteDocument } from '../../types/note'
import { applyNotebookSavePatch, createNotebookSavePatch } from './savePatch'

function note(): NoteDocument {
  return { id: 'n', title: 'Notebook', icon: '📓', folderId: null,
    createdAt: '2026-10-01', updatedAt: '2026-10-01', content: { type: 'doc', content: [] },
    documentKind: 'notebook', notebook: createNotebook(), future: { keep: true } }
}

describe('notebook save patches', () => {
  it('preserves unknown data and page/object order while transferring only changed ink', () => {
    const before = note()
    const page = before.notebook!.pages[0]
    page.objects = [{ id: 'old', actionId: 'old-action', kind: 'stroke', color: '#000000', width: 1.5,
      opacity: 1, future: 'keep', points: Array.from({ length: 4_096 }, (_, x) => ({ x, y: 10, pressure: 0 })) }]
    const added = { ...page.objects[0], id: 'new', actionId: 'new-action', points: [{ x: 30, y: 40, pressure: 1 }] }
    const after = { ...before, title: 'Renamed', notebook: { ...before.notebook!, pages: [
      { ...page, objects: [added, ...page.objects], paper: { ...page.paper, kind: 'grid' as const, future: true } },
      { ...page, id: 'blank', objects: [] },
    ] } }
    const patch = createNotebookSavePatch(before, after)
    expect(JSON.stringify(patch).length).toBeLessThan(2_000)
    expect(applyNotebookSavePatch(structuredClone(before), structuredClone(patch))).toEqual(after)
  })

  it('removes deleted pages, objects and metadata and can apply an undo snapshot', () => {
    const before = note()
    const after: NoteDocument = { ...before, notebook: { ...before.notebook!, pages: [{ ...before.notebook!.pages[0], future: true }] } }
    delete after.future
    const changed = applyNotebookSavePatch(before, createNotebookSavePatch(before, after))
    expect(changed).toEqual(after)
    expect(applyNotebookSavePatch(changed, createNotebookSavePatch(after, before))).toEqual(before)
  })
})
