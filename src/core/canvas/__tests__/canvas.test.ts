import { describe, expect, it } from 'vitest'
import {
  CANVAS_DOCUMENT_FRAME_ID,
  CANVAS_UNDO_STACK_LIMIT,
  CanvasStore,
  COLLAPSED_FRAME_HEIGHT,
  COLLAPSED_FRAME_WIDTH,
  createDefaultCanvasFrame,
  effectiveFrameBounds,
  MIN_FRAME_WIDTH,
  normalizeCanvasSnapshot,
  reflowConnectorBinding,
  type CanvasSnapshotV1,
} from '..'

describe('canvas snapshot normalization', () => {
  it('keeps legacy notes without a canvas backward compatible', () => {
    expect(normalizeCanvasSnapshot(undefined)).toBeNull()
  })

  it('rejects unknown versions', () => {
    expect(normalizeCanvasSnapshot({ version: 2 })).toBeNull()
  })

  it('normalizes invalid numbers, drops unknown element ids, and dedupes order', () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0 },
      elements: {
        shape: { id: 'shape', kind: 'shape', shape: 'triangle', x: 0, y: 0, width: 100, height: 80, zIndex: 1 },
      },
      connectors: {
        line: {
          id: 'line',
          from: { x: 10, y: 20, binding: { target: 'element', targetId: 'missing' } },
          to: { x: 30, y: 40, binding: { target: 'element', targetId: 'shape' } },
          routing: 'orthogonal',
          zIndex: 0,
        },
      },
      order: ['missing', 'shape', 'shape'],
    })

    expect(snapshot?.elements.shape).toMatchObject({ shape: 'rectangle' })
    expect(snapshot?.connectors.line.from.binding).toBeUndefined()
    expect(snapshot?.connectors.line.to.binding).toEqual({ target: 'element', targetId: 'shape' })
    expect(snapshot?.order).toEqual(['shape', CANVAS_DOCUMENT_FRAME_ID, 'line'])
  })

  it('only accepts an allowlisted fontFamily key, dropping anything else including injection-shaped strings', () => {
    const injected = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0 },
      elements: {
        text: {
          id: 'text',
          kind: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          zIndex: 0,
          text: 'hello',
          style: { fontFamily: 'x; background:url(evil)' },
        },
      },
      connectors: {},
      order: ['text'],
    })
    expect(injected?.elements.text?.style).toBeUndefined()

    const wrongType = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0 },
      elements: {
        text: {
          id: 'text',
          kind: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          zIndex: 0,
          text: 'hello',
          style: { fontFamily: 123 },
        },
      },
      connectors: {},
      order: ['text'],
    })
    expect(wrongType?.elements.text?.style).toBeUndefined()

    const allowed = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0 },
      elements: {
        text: {
          id: 'text',
          kind: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          zIndex: 0,
          text: 'hello',
          style: { fontFamily: 'serif' },
        },
      },
      connectors: {},
      order: ['text'],
    })
    expect(allowed?.elements.text?.style).toEqual({ fontFamily: 'serif' })
  })

  it('retargets a block-bound connector onto the document frame instead of dropping it', () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0 },
      elements: {},
      connectors: {
        line: {
          id: 'line',
          from: { x: 10, y: 20, binding: { target: 'block', targetId: 'some-old-block-id', side: 'right' } },
          to: { x: 30, y: 40 },
          routing: 'straight',
          zIndex: 0,
        },
      },
      order: ['line'],
    })

    expect(snapshot?.connectors.line).toBeDefined()
    expect(snapshot?.connectors.line.from).toEqual({
      x: 10,
      y: 20,
      binding: { target: 'block', targetId: CANVAS_DOCUMENT_FRAME_ID, side: 'right' },
    })
  })

  it('migrates a legacy snapshot with layouts and no frame into a frame covering their union bounds', () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      layouts: {
        a: { blockId: 'a', x: 0, y: 0, width: 500, height: 200, zIndex: 0 },
        b: { blockId: 'b', x: 100, y: 300, width: 600, height: 400, zIndex: 1 },
      },
      elements: {},
      connectors: {},
      order: ['a', 'b'],
    })

    // union of a (0,0,500,200) and b (100,300,600,400) => x:0 y:0 right:700 bottom:700,
    // then floored up to the default frame size since 700 < DEFAULT_FRAME_WIDTH/HEIGHT.
    expect(snapshot?.frame).toEqual({
      x: 0,
      y: 0,
      width: 900,
      height: 1200,
      zIndex: 0,
      autoHeight: true,
    })
    expect(snapshot).not.toHaveProperty('layouts')
  })

  it('clamps an out-of-range frame to safe values instead of trusting the input', () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: Number.NaN, y: Number.POSITIVE_INFINITY, width: 10, height: -10, zIndex: 2, unknown: true },
      elements: {},
      connectors: {},
      order: [],
    })
    expect(snapshot?.frame).toEqual({ x: 0, y: 0, width: MIN_FRAME_WIDTH, height: 24, zIndex: 2, autoHeight: true })
  })

  it('falls back to the default frame when there is neither a frame nor legacy layouts', () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      elements: {},
      connectors: {},
      order: [],
    })
    expect(snapshot?.frame).toEqual(createDefaultCanvasFrame())
  })

  it('preserves an explicit autoHeight: false and defaults a missing flag to true', () => {
    const fixed = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0, autoHeight: false },
      elements: {},
      connectors: {},
      order: [],
    })
    expect(fixed?.frame.autoHeight).toBe(false)

    const legacy = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0 },
      elements: {},
      connectors: {},
      order: [],
    })
    expect(legacy?.frame.autoHeight).toBe(true)
  })

  it('preserves an explicit collapsed: true and omits the flag when absent or false', () => {
    const collapsed = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0, collapsed: true },
      elements: {},
      connectors: {},
      order: [],
    })
    expect(collapsed?.frame.collapsed).toBe(true)

    const expanded = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0, collapsed: false },
      elements: {},
      connectors: {},
      order: [],
    })
    expect(expanded?.frame).not.toHaveProperty('collapsed')

    const missing = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0 },
      elements: {},
      connectors: {},
      order: [],
    })
    expect(missing?.frame).not.toHaveProperty('collapsed')
  })

  it('round-trips a collapsed frame through normalizeCanvasSnapshot', () => {
    const source = {
      version: 1 as const,
      frame: { x: 12, y: 34, width: 900, height: 1200, zIndex: 0, autoHeight: true, collapsed: true },
      elements: {},
      connectors: {},
      order: [],
    }
    const snapshot = normalizeCanvasSnapshot(source)
    expect(snapshot?.frame).toMatchObject({ x: 12, y: 34, collapsed: true })
    const roundTripped = normalizeCanvasSnapshot(snapshot)
    expect(roundTripped?.frame).toEqual(snapshot?.frame)
  })
})

describe('effectiveFrameBounds', () => {
  it('returns the fixed collapsed constants when collapsed, ignoring contentHeight and autoHeight', () => {
    const frame = { x: 5, y: 10, width: 900, height: 1200, zIndex: 0, autoHeight: true, collapsed: true }
    expect(effectiveFrameBounds(frame, 5000)).toEqual({
      x: 5,
      y: 10,
      width: COLLAPSED_FRAME_WIDTH,
      height: COLLAPSED_FRAME_HEIGHT,
    })

    const manuallyResized = { ...frame, autoHeight: false }
    expect(effectiveFrameBounds(manuallyResized, 5000)).toEqual({
      x: 5,
      y: 10,
      width: COLLAPSED_FRAME_WIDTH,
      height: COLLAPSED_FRAME_HEIGHT,
    })
  })

  it('falls back to the normal auto-height/manual-resize behavior when not collapsed', () => {
    const autoHeight = { x: 0, y: 0, width: 900, height: 1200, zIndex: 0, autoHeight: true }
    expect(effectiveFrameBounds(autoHeight, 1500)).toEqual({ x: 0, y: 0, width: 900, height: 1500 })

    const manual = { x: 0, y: 0, width: 900, height: 1200, zIndex: 0, autoHeight: false }
    expect(effectiveFrameBounds(manual, 1500)).toEqual({ x: 0, y: 0, width: 900, height: 1200 })
  })
})

describe('canvas connector bindings', () => {
  it('reflows bound endpoints and preserves free endpoints', () => {
    const connector = reflowConnectorBinding({
      id: 'line',
      from: { x: 0, y: 0, binding: { target: 'block', targetId: CANVAS_DOCUMENT_FRAME_ID, side: 'right' } },
      to: { x: 900, y: 500 },
      routing: 'orthogonal',
      zIndex: 0,
    }, 'block', CANVAS_DOCUMENT_FRAME_ID, { x: 100, y: 200, width: 300, height: 120 })

    expect(connector.from).toEqual({
      x: 400,
      y: 260,
      binding: { target: 'block', targetId: CANVAS_DOCUMENT_FRAME_ID, side: 'right' },
    })
    expect(connector.to).toEqual({ x: 900, y: 500 })
  })
})

describe('CanvasStore', () => {
  it('treats one commit as one undo step', () => {
    const store = new CanvasStore()
    store.load(undefined)

    const changed = store.commit((draft) => {
      draft.frame = { ...draft.frame, x: 100, y: 80 }
    })

    expect(changed).toBe(true)
    expect(store.snapshot.frame).toMatchObject({ x: 100, y: 80 })
    expect(store.canUndo).toBe(true)
    store.undo()
    expect(store.snapshot.frame).toMatchObject({ x: 0, y: 0 })
    expect(store.canUndo).toBe(false)
  })

  it('round-trips a commit through undo and redo', () => {
    const store = new CanvasStore()
    store.load(undefined)
    store.commit((draft) => { draft.frame = { ...draft.frame, x: 40 } })

    store.undo()
    expect(store.snapshot.frame.x).toBe(0)
    expect(store.canRedo).toBe(true)

    store.redo()
    expect(store.snapshot.frame.x).toBe(40)
    expect(store.canRedo).toBe(false)
  })

  it('clears the redo stack once a new commit is made', () => {
    const store = new CanvasStore()
    store.load(undefined)
    store.commit((draft) => { draft.frame = { ...draft.frame, x: 40 } })
    store.undo()
    expect(store.canRedo).toBe(true)

    store.commit((draft) => { draft.frame = { ...draft.frame, x: 99 } })

    expect(store.canRedo).toBe(false)
    store.undo()
    expect(store.snapshot.frame.x).toBe(0)
  })

  it('caps the undo stack, dropping the oldest entries', () => {
    const store = new CanvasStore()
    store.load(undefined)
    const commitCount = CANVAS_UNDO_STACK_LIMIT + 5
    for (let index = 0; index < commitCount; index += 1) {
      store.commit((draft) => { draft.frame = { ...draft.frame, x: index + 1 } })
    }

    let undone = 0
    while (store.canUndo) {
      store.undo()
      undone += 1
    }

    expect(undone).toBe(CANVAS_UNDO_STACK_LIMIT)
    // The oldest commits were evicted, so undoing all retained steps lands on
    // the state right after the dropped commits, not the very first commit.
    expect(store.snapshot.frame.x).toBe(commitCount - CANVAS_UNDO_STACK_LIMIT)
  })

  it('does not push history for a commit that produces no structural change', () => {
    const store = new CanvasStore()
    store.load(undefined)

    const changed = store.commit((draft) => {
      draft.frame = { ...draft.frame }
    })

    expect(changed).toBe(false)
    expect(store.canUndo).toBe(false)
  })

  it('migrates a legacy per-block layout map when loading a mirror, with a clean history', () => {
    const store = new CanvasStore()
    const legacyMirror = {
      version: 1,
      layouts: {
        'legacy-block': { blockId: 'legacy-block', x: 40, y: 60, width: 480, height: 320, zIndex: 0 },
      },
    } as unknown as CanvasSnapshotV1

    store.load(legacyMirror)

    expect(store.snapshot.frame).toMatchObject({ x: 40, y: 60 })
    expect(store.canUndo).toBe(false)
    expect(store.canRedo).toBe(false)
  })
})
