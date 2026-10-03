import { describe, expect, it, vi } from 'vitest'
import { createNotebook, decodeNotebook, encodeNotebook } from '../../../core/notebook/codec'
import { useNotebookDocument } from './useNotebookDocument'

const base = { color: '#123456', width: 2, markerWidth: 12, eraserDiameter: 12 }
const points = Array.from({ length: 6 }, (_, index) => ({ x: index * 5, y: 10, pressure: 0.5 }))

describe('useNotebookDocument modeled strokes', () => {
  it.each([['pen', 'stroke'], ['marker', 'highlighter']] as const)('marks %s gestures with path "modeled" across checkpoint and final commit', (tool, kind) => {
    const initial = createNotebook('plain')
    const document = useNotebookDocument(initial, vi.fn())
    const style = { ...base, modeled: true }
    document.checkpointGesture(points.slice(0, 3), tool, style, 'a1', initial.pages[0].id)
    document.applyGesture(points, tool, style, initial.pages[0].id, 'a1')
    const objects = document.currentPage.value.objects
    expect(objects.length).toBeGreaterThan(0)
    expect(objects.every(object => object.kind === kind && object.path === 'modeled')).toBe(true)
    expect(objects.flatMap(object => object.points)).toHaveLength(points.length + objects.length - 1)

    const decoded = decodeNotebook(JSON.parse(encodeNotebook(document.snapshot.value)))
    expect(decoded.status).toBe('valid')
  })

  it('does not mark unmodeled pen strokes or other tools', () => {
    const initial = createNotebook('plain')
    const document = useNotebookDocument(initial, vi.fn())
    document.applyGesture(points, 'pen', base, initial.pages[0].id, 'a1')
    document.applyGesture([{ x: 0, y: 0 }, { x: 40, y: 40 }], 'line', { ...base, modeled: true }, initial.pages[0].id, 'a2')
    const objects = document.currentPage.value.objects
    expect(objects).toHaveLength(2)
    expect(objects.some(object => 'path' in object)).toBe(false)
  })

  it('does not mark a recognized shape that replaces a modeled gesture', () => {
    const initial = createNotebook('plain')
    const document = useNotebookDocument(initial, vi.fn())
    document.checkpointGesture(points, 'pen', { ...base, modeled: true }, 'a1', initial.pages[0].id)
    document.applyRecognizedStroke([{ x: 0, y: 0 }, { x: 40, y: 0 }], base, initial.pages[0].id, 'a1')
    const objects = document.currentPage.value.objects
    expect(objects).toHaveLength(1)
    expect('path' in objects[0]).toBe(false)
  })
})
