import { describe, expect, it, vi } from 'vitest'
import { createNotebook } from '../../../core/notebook/codec'
import { insertNotebookPage } from '../../../core/notebook/operations'
import { NOTEBOOK_OBJECT_LIMIT, NOTEBOOK_PAGE_LIMIT } from '../../../core/notebook/types'
import type { NotebookSnapshotV1 } from '../../../core/notebook/types'
import { useNotebookDocument } from './useNotebookDocument'

const style = { color: '#123456', width: 3, markerWidth: 12, eraserDiameter: 12 }
const points = [{ x: 20, y: 40 }, { x: 60, y: 60 }, { x: 100, y: 90 }]

function open(initial: NotebookSnapshotV1 = createNotebook('ruled')) {
  const changed = vi.fn()
  const document = useNotebookDocument(initial, changed)
  return { initial, changed, document }
}

describe('useNotebookGhostPage', () => {
  it('always offers a ghost page like the last page without storing it', () => {
    const { initial, document, changed } = open(createNotebook('grid'))
    const ghost = document.ghostPage.value!
    expect(ghost.id).not.toBe(initial.pages[0].id)
    expect(ghost.paper.kind).toBe('grid')
    expect(ghost.objects).toEqual([])
    expect(document.snapshot.value).toBe(initial)
    expect(changed).not.toHaveBeenCalled()
  })

  it('creates the page and the stroke in one commit and removes both with one Undo', () => {
    const { initial, document, changed } = open()
    const ghostId = document.ghostPage.value!.id
    document.applyGesture(points, 'pen', style, ghostId, 'a1')
    const snapshot = document.snapshot.value
    expect(snapshot.pages).toHaveLength(2)
    expect(snapshot.pages[1].id).toBe(ghostId)
    expect(snapshot.pages[1].objects).toHaveLength(1)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(document.currentPage.value.id).toBe(ghostId)
    expect(document.ghostPage.value!.id).not.toBe(ghostId)
    expect(document.history.canUndo.value).toBe(true)
    document.history.undo()
    expect(document.snapshot.value).toBe(initial)
    expect(document.history.canUndo.value).toBe(false)
    document.history.redo()
    expect(document.snapshot.value).toBe(snapshot)
    expect(document.snapshot.value.pages).toHaveLength(2)
  })

  it('stays on the last remaining page when Undo removes the auto-added page', () => {
    const initial = insertNotebookPage(insertNotebookPage(createNotebook('ruled')))
    const { document } = open(initial)
    document.setCurrentPage(initial.pages[2].id)
    document.applyGesture(points, 'pen', style, document.ghostPage.value!.id, 'a1')
    expect(document.currentPage.value.id).toBe(document.snapshot.value.pages[3].id)
    document.history.undo()
    expect(document.snapshot.value).toBe(initial)
    expect(document.currentPage.value.id).toBe(initial.pages[2].id)
  })

  it('merges a checkpoint and the final stroke into one history entry', () => {
    const { initial, document } = open()
    const ghostId = document.ghostPage.value!.id
    document.checkpointGesture(points.slice(0, 2), 'pen', style, 'a1', ghostId)
    expect(document.snapshot.value.pages).toHaveLength(2)
    document.applyGesture(points, 'pen', style, ghostId, 'a1')
    expect(document.snapshot.value.pages).toHaveLength(2)
    document.history.undo()
    expect(document.snapshot.value).toBe(initial)
    expect(document.history.canUndo.value).toBe(false)
  })

  it('stores a recognized shape on the ghost page in the same commit', () => {
    const { initial, document } = open()
    const ghostId = document.ghostPage.value!.id
    document.applyRecognizedStroke(points, style, ghostId, 'a1')
    expect(document.snapshot.value.pages[1].objects).toHaveLength(1)
    document.history.undo()
    expect(document.snapshot.value).toBe(initial)
  })

  it('leaves the snapshot untouched for eraser, lasso, move, laser and degenerate gestures', () => {
    const { initial, document, changed } = open()
    const ghostId = document.ghostPage.value!.id
    for (const tool of ['eraser', 'lasso', 'move', 'laser'] as const) {
      document.applyGesture(points, tool, style, ghostId, `a-${tool}`)
      expect(document.snapshot.value).toBe(initial)
    }
    document.applyGesture([], 'pen', style, ghostId, 'empty')
    document.applyRecognizedStroke([points[0]], style, ghostId, 'short')
    expect(document.snapshot.value).toBe(initial)
    expect(changed).not.toHaveBeenCalled()
    expect(document.history.canUndo.value).toBe(false)
    expect(document.ghostPage.value!.id).toBe(ghostId)
  })

  it('does not offer a ghost at the page limit', () => {
    const base = createNotebook()
    const full = { ...base, pages: Array.from({ length: NOTEBOOK_PAGE_LIMIT }, (_, index) => ({ ...base.pages[0], id: `page-${index}` })) }
    expect(open(full).document.ghostPage.value).toBeNull()
  })

  it('rolls staging back when the object limit rejects the first stroke', () => {
    const base = createNotebook()
    const objects = Array.from({ length: NOTEBOOK_OBJECT_LIMIT }, (_, index) => ({
      id: `s${index}`, actionId: `x${index}`, kind: 'stroke' as const, color: '#000000', width: 1, opacity: 1, points: [{ x: 1, y: 1 }],
    }))
    const initial = { ...base, pages: [{ ...base.pages[0], objects }] }
    const { document, changed } = open(initial)
    const ghostId = document.ghostPage.value!.id
    document.applyGesture(points, 'pen', style, ghostId, 'a1')
    expect(document.snapshot.value).toBe(initial)
    expect(document.limitReached.value).toBe('notebook.errors.objectLimit')
    expect(changed).not.toHaveBeenCalled()
    expect(document.history.canUndo.value).toBe(false)
    expect(document.ghostPage.value!.id).toBe(ghostId)
  })

  it('keeps ordinary gestures on real pages unaffected', () => {
    const { initial, document } = open()
    document.applyGesture(points, 'pen', style, initial.pages[0].id, 'a1')
    expect(document.snapshot.value.pages).toHaveLength(1)
    expect(document.snapshot.value.pages[0].objects).toHaveLength(1)
  })
})
