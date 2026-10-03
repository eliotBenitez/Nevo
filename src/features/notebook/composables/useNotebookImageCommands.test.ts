import { describe, expect, it, vi } from 'vitest'
import { createNotebook, decodeNotebook, encodeNotebook } from '../../../core/notebook/codec'
import { NOTEBOOK_A4_WIDTH } from '../../../core/notebook/types'
import { useNotebookDocument } from './useNotebookDocument'

describe('notebook image commands', () => {
  it('inserts a fitted image on top as one undo step and selects it', () => {
    const initial = createNotebook('plain')
    initial.pages[0].objects = [{
      id: 'ink', actionId: 'a', kind: 'stroke', color: '#000000', width: 2, opacity: 1,
      points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
    }]
    const changed = vi.fn()
    const document = useNotebookDocument(initial, changed)
    const id = document.insertImage('.nevo/assets/photo.png', 1000, 500)
    expect(id).toBeTruthy()
    const next = document.snapshot.value
    expect(next.pages[0].objects.map(object => object.id)).toEqual(['ink', id])
    const image = next.pages[0].objects[1]
    expect(image).toMatchObject({ kind: 'image', src: '.nevo/assets/photo.png', opacity: 1 })
    expect(image.points).toHaveLength(4)
    expect(image.points[1].x - image.points[0].x).toBeCloseTo(NOTEBOOK_A4_WIDTH * 0.6)
    expect(document.selectedObjectIds.value).toEqual([id])
    expect(decodeNotebook(encodeNotebook(next)).status).toBe('valid')
    expect(document.history.canUndo.value).toBe(true)

    document.history.undo()
    expect(document.snapshot.value).toBe(initial)
    expect(document.history.canUndo.value).toBe(false)
    document.history.redo()
    expect(document.snapshot.value).toBe(next)
  })

  it('refuses an unsupported asset src so later saves cannot start failing', () => {
    const initial = createNotebook('plain')
    const document = useNotebookDocument(initial, vi.fn())
    expect(document.insertImage('.nevo/assets/hash-photo.bin', 100, 100)).toBeNull()
    expect(document.insertImage('.nevo/assets/diagram.svg', 100, 100)).toBeNull()
    expect(document.snapshot.value).toBe(initial)
    expect(document.history.canUndo.value).toBe(false)
  })

  it('refuses to insert beyond the serialized size budget and keeps the snapshot', () => {
    const initial = createNotebook('plain')
    const document = useNotebookDocument(initial, vi.fn(), 100)
    expect(document.insertImage('.nevo/assets/photo.png', 10, 10)).toBeNull()
    expect(document.snapshot.value).toBe(initial)
    expect(document.limitReached.value).toBe('notebook.errors.serializedLimit')
  })

  it('keeps ink untouched by the eraser and unaffected by recoloring when an image is selected', () => {
    const document = useNotebookDocument(createNotebook('plain'), vi.fn())
    const id = document.insertImage('.nevo/assets/photo.png', 100, 100)!
    const inserted = document.snapshot.value
    document.colorSelection('#ff0000')
    expect(document.snapshot.value).toBe(inserted)
    document.applyGesture(
      [{ x: 0, y: 0 }, { x: 600, y: 842 }], 'eraser',
      { color: '#000000', width: 1, markerWidth: 12, eraserDiameter: 800, eraserMode: 'partial' },
    )
    expect(document.snapshot.value).toBe(inserted)
    document.applyGesture(
      [{ x: 0, y: 0 }, { x: 600, y: 842 }], 'eraser',
      { color: '#000000', width: 1, markerWidth: 12, eraserDiameter: 800, eraserMode: 'stroke' },
    )
    expect(document.currentPage.value.objects.map(object => object.id)).toEqual([id])
  })
})
