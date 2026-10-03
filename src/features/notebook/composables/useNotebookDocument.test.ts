import { describe, expect, it, vi } from 'vitest'
import { createNotebook, decodeNotebook, encodeNotebook } from '../../../core/notebook/codec'
import { createNotebookExport } from '../../../core/notebook/export'
import { useNotebookDocument } from './useNotebookDocument'

describe('useNotebookDocument', () => {
  it('never persists laser input or adds it to Undo/checkpoint history', () => {
    const initial = createNotebook()
    const changed = vi.fn()
    const document = useNotebookDocument(initial, changed)
    const points = [{ x: 20, y: 40 }, { x: 100, y: 90 }]
    const style = { color: '#ef4444', width: 3, markerWidth: 12, eraserDiameter: 12 }
    document.checkpointGesture(points, 'laser', style, 'laser', initial.pages[0].id)
    document.applyGesture(points, 'laser', style, initial.pages[0].id, 'laser')
    expect(document.snapshot.value).toBe(initial)
    expect(changed).not.toHaveBeenCalled()
    expect(document.history.canUndo.value).toBe(false)
  })
  it('commits an arrow once, round-trips ordinary strokes, and undoes the entire shape', () => {
    const initial = { ...createNotebook('plain'), vendor: { keep: true } }
    const document = useNotebookDocument(initial, vi.fn())
    const points = [{ x: 20, y: 40 }, { x: 100, y: 90 }]
    const style = { color: '#123456', width: 3, markerWidth: 12, eraserDiameter: 12 }
    document.checkpointGesture(points, 'arrow', style, 'arrow-1', initial.pages[0].id)
    expect(document.currentPage.value.objects).toHaveLength(0)
    document.applyGesture(points, 'arrow', style, initial.pages[0].id, 'arrow-1')
    const snapshot = document.snapshot.value
    expect(snapshot.pages[0].objects).toHaveLength(3)
    expect(snapshot.pages[0].objects.every(s => s.kind === 'stroke' && s.actionId === 'arrow-1' && s.color === '#123456' && s.width === 3)).toBe(true)
    const decoded = decodeNotebook(JSON.parse(encodeNotebook(snapshot)))
    expect(decoded.status).toBe('valid')
    if (decoded.status === 'valid') expect(decoded.snapshot).toEqual(snapshot)
    expect(createNotebookExport(snapshot, false).pages[0].paths).toHaveLength(3)
    expect(snapshot.vendor).toEqual({ keep: true })
    document.history.undo()
    expect(document.snapshot.value).toEqual(initial)
    expect(document.history.canUndo.value).toBe(false)
    document.history.redo()
    expect(document.snapshot.value).toEqual(snapshot)
  })

  it('stores a straight line as one two-point stroke with its dash style and expands it on export', () => {
    const initial = createNotebook('plain')
    const document = useNotebookDocument(initial, vi.fn())
    const style = { color: '#123456', width: 3, markerWidth: 12, eraserDiameter: 12, dash: 'dashed' as const }
    document.applyGesture([{ x: 20, y: 40 }, { x: 90, y: 40 }, { x: 100, y: 40 }], 'line', style, initial.pages[0].id, 'line-1')
    const objects = document.currentPage.value.objects
    expect(objects).toHaveLength(1)
    expect(objects[0]).toMatchObject({ kind: 'stroke', actionId: 'line-1', color: '#123456', width: 3, dash: 'dashed' })
    expect(objects[0].points).toEqual([{ x: 20, y: 40, pressure: 0.5 }, { x: 100, y: 40, pressure: 0.5 }])
    expect(createNotebookExport(document.snapshot.value, false).pages[0].paths.length).toBeGreaterThan(1)
    const decoded = decodeNotebook(JSON.parse(encodeNotebook(document.snapshot.value)))
    expect(decoded.status).toBe('valid')
    if (decoded.status === 'valid') expect(decoded.snapshot).toEqual(document.snapshot.value)
    document.history.undo()
    expect(document.currentPage.value.objects).toHaveLength(0)
  })

  it('omits the dash field for a solid straight line and exports a single path', () => {
    const document = useNotebookDocument(createNotebook(), vi.fn())
    document.applyGesture([{ x: 0, y: 0 }, { x: 50, y: 50 }], 'line')
    const object = document.currentPage.value.objects[0]
    expect(object.dash).toBeUndefined()
    expect(createNotebookExport(document.snapshot.value, false).pages[0].paths).toHaveLength(1)
  })

  it('stores a shape as one closed stroke and undoes it in a single step', () => {
    const document = useNotebookDocument(createNotebook('plain'), vi.fn())
    document.applyGesture([{ x: 20, y: 40 }, { x: 120, y: 100 }], 'rectangle')
    const objects = document.currentPage.value.objects
    expect(objects).toHaveLength(1)
    expect(objects[0]).toMatchObject({ kind: 'stroke', width: 1.5, opacity: 1 })
    expect(objects[0].points).toHaveLength(5)
    expect(objects[0].points[0]).toEqual({ x: 20, y: 40, pressure: 0.5 })
    expect(objects[0].points.at(-1)).toEqual({ x: 20, y: 40, pressure: 0.5 })
    expect(objects[0].dash).toBeUndefined()
    expect(createNotebookExport(document.snapshot.value, false).pages[0].paths).toHaveLength(1)
    document.history.undo()
    expect(document.currentPage.value.objects).toHaveLength(0)
  })

  it('forces a circle square and never attaches a line dash to a shape', () => {
    const document = useNotebookDocument(createNotebook('plain'), vi.fn())
    const style = { color: '#111111', width: 2, markerWidth: 12, eraserDiameter: 12, dash: 'dashed' as const }
    document.applyGesture([{ x: 0, y: 0 }, { x: 60, y: 20 }], 'circle', style)
    const stroke = document.currentPage.value.objects[0]
    expect(stroke.dash).toBeUndefined()
    const xs = stroke.points.map(point => point.x)
    const ys = stroke.points.map(point => point.y)
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(Math.max(...ys) - Math.min(...ys), 6)
  })

  it('rejects an entire arrow when the byte budget cannot fit all parts', () => {
    const initial = createNotebook()
    const budget = new TextEncoder().encode(encodeNotebook(initial)).byteLength + 100
    const document = useNotebookDocument(initial, vi.fn(), budget)
    document.applyGesture([{ x: 20, y: 40 }, { x: 100, y: 90 }], 'arrow')
    expect(document.snapshot.value).toBe(initial)
    expect(document.history.canUndo.value).toBe(false)
    expect(document.limitReached.value).toBe('notebook.errors.serializedLimit')
  })
  it('checkpoints an eraser contact and groups all cuts into one undo step', () => {
    const initial = createNotebook()
    initial.pages[0].objects = [20, 60].map((y, index) => ({ id: `s-${index}`, actionId: `a-${index}`,
      kind: 'stroke', color: '#000000', width: 4, opacity: 1, points: [{ x: 10, y }, { x: 100, y }] }))
    const document = useNotebookDocument(initial, vi.fn())
    const points = [{ x: 50, y: 0 }, { x: 50, y: 40 }]
    const style = { color: '#000000', width: 1.5, markerWidth: 12, eraserDiameter: 12 }
    document.checkpointGesture(points, 'eraser', style, 'erasing', initial.pages[0].id)
    expect(document.snapshot.value).not.toBe(initial)
    document.checkpointGesture([...points, { x: 50, y: 80 }], 'eraser', style, 'erasing', initial.pages[0].id)
    document.history.undo()
    expect(document.snapshot.value).toEqual(initial)
    expect(document.history.canUndo.value).toBe(false)
  })

  it('retains an accepted ink prefix when the remaining note byte budget is exhausted', () => {
    const initial = createNotebook()
    const budget = new TextEncoder().encode(encodeNotebook(initial)).byteLength + 450
    const document = useNotebookDocument(initial, vi.fn(), budget)
    document.applyGesture(Array.from({ length: 100 }, (_, x) => ({ x, y: 10 })), 'pen')
    const accepted = document.currentPage.value.objects.flatMap(object => object.points)
    expect(accepted.length).toBeGreaterThan(0)
    expect(accepted.length).toBeLessThan(100)
    expect(new TextEncoder().encode(encodeNotebook(document.snapshot.value)).byteLength).toBeLessThanOrEqual(budget)
    expect(document.limitReached.value).toBe('notebook.errors.serializedLimit')
  })

  it('reports the page limit without throwing when duplicating the last allowed page', () => {
    const initial = createNotebook()
    initial.pages = Array.from({ length: 1_000 }, (_, index) => ({ ...initial.pages[0], id: `page-${index}` }))
    const document = useNotebookDocument(initial, vi.fn())
    expect(() => document.duplicatePage('page-0')).not.toThrow()
    expect(document.snapshot.value.pages).toHaveLength(1_000)
    expect(document.limitReached.value).toBe('notebook.errors.pageLimit')
    expect(document.history.canUndo.value).toBe(false)
  })

  it('segments long strokes at the format limit while keeping one undo action and unknown fields', () => {
    const initial = { ...createNotebook('plain'), future: { keep: true } }
    const onSnapshot = vi.fn()
    const document = useNotebookDocument(initial, onSnapshot)
    const points = Array.from({ length: 8_193 }, (_, index) => ({ x: index / 10, y: 20, pressure: 0 }))

    document.applyGesture(points, 'pen')

    const objects = document.currentPage.value.objects
    expect(objects.map(object => object.points.length)).toEqual([4_096, 4_096, 3])
    expect(new Set(objects.map(object => object.actionId)).size).toBe(1)
    expect(document.snapshot.value.future).toEqual({ keep: true })
    expect(document.history.canUndo.value).toBe(true)

    document.history.undo()
    expect(document.currentPage.value.objects).toEqual([])
    expect(document.history.canRedo.value).toBe(true)
    document.history.redo()
    expect(document.currentPage.value.objects).toHaveLength(3)
  })

  it('duplicates pages with new IDs and makes the clone a single undoable operation', () => {
    const document = useNotebookDocument(createNotebook('grid'), vi.fn())
    const sourceId = document.currentPage.value.id

    const copyId = document.duplicatePage(sourceId)

    expect(copyId).not.toBe(sourceId)
    expect(document.snapshot.value.pages).toHaveLength(2)
    expect(document.snapshot.value.pages[1].paper.kind).toBe('grid')
    document.history.undo()
    expect(document.snapshot.value.pages).toHaveLength(1)
  })

  it('persists active stroke checkpoints and keeps the whole contact as one undo step', () => {
    const document = useNotebookDocument(createNotebook('plain'), vi.fn())
    const pageId = document.currentPage.value.id
    const actionId = 'long-contact-1'
    const style = { color: '#000000', width: 1.5, markerWidth: 12, eraserDiameter: 12 }
    const points = Array.from({ length: 20 }, (_, index) => ({ x: index, y: 10, pressure: 0.5 }))

    document.checkpointGesture(points.slice(0, 10), 'pen', style, actionId, pageId)
    document.checkpointGesture(points, 'pen', style, actionId, pageId)
    document.applyGesture(points, 'pen', style, pageId, actionId)

    expect(document.currentPage.value.objects).toHaveLength(2)
    expect(document.currentPage.value.objects.every(object => object.actionId === actionId)).toBe(true)
    document.history.undo()
    expect(document.currentPage.value.objects).toHaveLength(0)
    expect(document.history.canUndo.value).toBe(false)
  })

  it('replaces checkpointed freehand ink with a recognized stroke as one undo step', () => {
    const initial = createNotebook('plain')
    const document = useNotebookDocument(initial, vi.fn())
    const pageId = initial.pages[0].id
    const style = { color: '#123456', width: 3, markerWidth: 12, eraserDiameter: 12 }
    const freehand = [{ x: 20, y: 40 }, { x: 60, y: 44 }, { x: 100, y: 90 }]
    document.checkpointGesture(freehand, 'pen', style, 'hold-1', pageId)
    expect(document.currentPage.value.objects.length).toBeGreaterThan(0)
    const clean = [{ x: 20, y: 40, pressure: 0.5 }, { x: 100, y: 90, pressure: 0.5 }]
    document.applyRecognizedStroke(clean, style, pageId, 'hold-1')
    const objects = document.currentPage.value.objects
    expect(objects).toHaveLength(1)
    expect(objects[0]).toMatchObject({ kind: 'stroke', actionId: 'hold-1', color: '#123456', width: 3, opacity: 1, points: clean })
    const decoded = decodeNotebook(JSON.parse(encodeNotebook(document.snapshot.value)))
    expect(decoded.status).toBe('valid')
    document.history.undo()
    expect(document.snapshot.value).toEqual(initial)
    expect(document.history.canUndo.value).toBe(false)
  })

  it('erases whole strokes in stroke mode and leaves other ink untouched', () => {
    const initial = createNotebook('plain')
    const document = useNotebookDocument(initial, vi.fn())
    const pageId = initial.pages[0].id
    const style = { color: '#000000', width: 2, markerWidth: 12, eraserDiameter: 6 }
    document.applyGesture([{ x: 10, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 100 }], 'pen', style, pageId, 'ink-a')
    document.applyGesture([{ x: 10, y: 300 }, { x: 200, y: 300 }], 'pen', style, pageId, 'ink-b')
    const before = document.currentPage.value.objects
    const keep = before.filter(object => object.actionId === 'ink-b')
    document.applyGesture([{ x: 100, y: 0 }, { x: 100, y: 20 }], 'eraser', { ...style, eraserMode: 'stroke' }, pageId, 'erase-1')
    const after = document.currentPage.value.objects
    expect(after).toHaveLength(keep.length)
    expect(after.every((object, index) => object === keep[index])).toBe(true)
    document.history.undo()
    expect(document.currentPage.value.objects).toEqual(before)
  })
})
