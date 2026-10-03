import { describe, expect, it, vi } from 'vitest'
import { createNotebook, decodeNotebook, encodeNotebook } from '../../../core/notebook/codec'
import { useNotebookDocument } from './useNotebookDocument'

function fixture(limit?: number) {
  const initial = createNotebook('grid')
  initial.pages[0].objects = ['a', 'b'].map((id, index) => ({
    id, actionId: 'shared', kind: 'stroke', color: '#123456', width: 2, opacity: 1,
    vendor: { keep: true }, points: [{ x: 100 + index * 20, y: 100 }, { x: 200, y: 150, vendor: 'point' }],
  }))
  const changed = vi.fn()
  const document = useNotebookDocument(initial, changed, limit)
  document.selectedObjectIds.value = ['a', 'b']
  return { initial, document, changed }
}

describe('notebook selection commands', () => {
  it('copies an action group, offsets and selects copies with one-step Undo/Redo', () => {
    const { initial, document } = fixture()
    document.copySelection()
    const next = document.snapshot.value
    const copies = next.pages[0].objects.slice(2)
    expect(copies).toHaveLength(2)
    expect(new Set(next.pages[0].objects.map(s => s.id)).size).toBe(4)
    expect(copies[0].actionId).toBe(copies[1].actionId)
    expect(copies[0].actionId).not.toBe('shared')
    expect(copies[0].points[0].x).toBe(112)
    expect(copies[0].vendor).toEqual({ keep: true })
    expect(document.selectedObjectIds.value).toEqual(copies.map(s => s.id))
    expect(decodeNotebook(encodeNotebook(next)).status).toBe('valid')
    document.history.undo()
    expect(document.snapshot.value).toBe(initial)
    document.history.redo()
    expect(document.snapshot.value).toBe(next)
  })

  it('transforms and recolors only selected ink and undoes each command once', () => {
    const { initial, document, changed } = fixture()
    document.selectedObjectIds.value = ['a']
    document.transformSelection({ scale: 2, angle: 90 })
    const transformed = document.snapshot.value
    expect(transformed.pages[0].objects[1]).toBe(initial.pages[0].objects[1])
    document.colorSelection('#ff0000')
    expect(document.currentPage.value.objects[0].color).toBe('#ff0000')
    expect(document.currentPage.value.objects[0].points).toBe(transformed.pages[0].objects[0].points)
    document.history.undo()
    expect(document.snapshot.value).toBe(transformed)
    document.history.undo()
    expect(document.snapshot.value).toBe(initial)
    expect(changed).toHaveBeenCalledTimes(4)
  })

  it('leaves the snapshot and selection intact when copies exceed the byte budget', () => {
    const { initial, document, changed } = fixture(600)
    document.copySelection()
    expect(document.snapshot.value).toBe(initial)
    expect(document.selectedObjectIds.value).toEqual(['a', 'b'])
    expect(document.limitReached.value).toBe('notebook.errors.serializedLimit')
    expect(changed).not.toHaveBeenCalled()
    expect(document.history.canUndo.value).toBe(false)
  })

  it('does not record identical colors or invalid transforms', () => {
    const { initial, document, changed } = fixture()
    document.colorSelection('#123456')
    document.colorSelection('red')
    document.transformSelection({ scale: NaN })
    expect(document.snapshot.value).toBe(initial)
    expect(changed).not.toHaveBeenCalled()
  })

  it('aligns and distributes as one undo step each and skips no-op commands', () => {
    const initial = createNotebook('grid')
    initial.pages[0].objects = [['a', 40, 50], ['b', 120, 90], ['c', 300, 130]].map(([id, x, y]) => ({
      id: id as string, actionId: id as string, kind: 'stroke' as const, color: '#123456', width: 2, opacity: 1,
      points: [{ x: x as number, y: y as number }, { x: (x as number) + 20, y: (y as number) + 20 }],
    }))
    const changed = vi.fn()
    const document = useNotebookDocument(initial, changed)
    document.selectedObjectIds.value = ['a', 'b', 'c']
    document.alignSelection('top')
    const aligned = document.snapshot.value
    expect(aligned.pages[0].objects.map(object => object.points[0].y)).toEqual([50, 50, 50])
    document.alignSelection('top')
    expect(document.snapshot.value).toBe(aligned)
    document.distributeSelection('horizontal')
    const distributed = document.snapshot.value
    expect(distributed).not.toBe(aligned)
    expect(distributed.pages[0].objects[1].points[0].x).toBe(170)
    document.history.undo()
    expect(document.snapshot.value).toBe(aligned)
    document.history.undo()
    expect(document.snapshot.value).toBe(initial)
    expect(changed).toHaveBeenCalledTimes(4)
  })

  it('flips the selection as one undo step', () => {
    const initial = createNotebook('grid')
    initial.pages[0].objects = [{
      id: 'a', actionId: 'a', kind: 'stroke', color: '#123456', width: 2, opacity: 1,
      points: [{ x: 40, y: 50 }, { x: 100, y: 80 }],
    }]
    const document = useNotebookDocument(initial, vi.fn())
    document.selectedObjectIds.value = ['a']
    document.flipSelection('horizontal')
    expect(document.snapshot.value.pages[0].objects[0].points.map(point => [point.x, point.y])).toEqual([[100, 50], [40, 80]])
    expect(document.selectedObjectIds.value).toEqual(['a'])
    document.history.undo()
    expect(document.snapshot.value).toBe(initial)
  })
})
