import { describe, expect, it } from 'vitest'
import { canvasSnapshotsEqual, CANVAS_SNAPSHOT_VERSION, type CanvasSnapshotV1 } from '..'

function baseSnapshot(): CanvasSnapshotV1 {
  return {
    version: CANVAS_SNAPSHOT_VERSION,
    frame: { x: 0, y: 0, width: 900, height: 1200, zIndex: 0, autoHeight: true },
    elements: {
      shape: { id: 'shape', kind: 'shape', shape: 'rectangle', x: 10, y: 20, width: 100, height: 80, zIndex: 1 },
    },
    connectors: {
      line: {
        id: 'line',
        from: { x: 10, y: 20 },
        to: { x: 30, y: 40 },
        routing: 'straight',
        zIndex: 0,
      },
    },
    order: ['shape', 'line'],
  }
}

describe('canvasSnapshotsEqual', () => {
  it('treats identical snapshots as equal', () => {
    const a = baseSnapshot()
    const b = baseSnapshot()
    expect(canvasSnapshotsEqual(a, b)).toBe(true)
  })

  it('handles undefined on either side', () => {
    expect(canvasSnapshotsEqual(undefined, undefined)).toBe(true)
    expect(canvasSnapshotsEqual(baseSnapshot(), undefined)).toBe(false)
    expect(canvasSnapshotsEqual(undefined, baseSnapshot())).toBe(false)
  })

  it('detects a frame field change', () => {
    const a = baseSnapshot()
    const b = baseSnapshot()
    b.frame = { ...b.frame, x: 42 }
    expect(canvasSnapshotsEqual(a, b)).toBe(false)
  })

  it('distinguishes a collapsed frame from an expanded one', () => {
    const a = baseSnapshot()
    const b = baseSnapshot()
    b.frame = { ...b.frame, collapsed: true }
    expect(canvasSnapshotsEqual(a, b)).toBe(false)
    expect(canvasSnapshotsEqual(b, b)).toBe(true)
  })

  it('detects an added element', () => {
    const a = baseSnapshot()
    const b = baseSnapshot()
    b.elements = {
      ...b.elements,
      text: { id: 'text', kind: 'text', x: 0, y: 0, width: 100, height: 40, zIndex: 2, text: 'hi' },
    }
    expect(canvasSnapshotsEqual(a, b)).toBe(false)
  })

  it('detects a removed element', () => {
    const a = baseSnapshot()
    const b = baseSnapshot()
    b.elements = {}
    expect(canvasSnapshotsEqual(a, b)).toBe(false)
  })

  it('detects an element geometry change', () => {
    const a = baseSnapshot()
    const b = baseSnapshot()
    b.elements = { shape: { ...b.elements.shape, x: 999 } }
    expect(canvasSnapshotsEqual(a, b)).toBe(false)
  })

  it('detects a connector change', () => {
    const a = baseSnapshot()
    const b = baseSnapshot()
    b.connectors = { line: { ...b.connectors.line, routing: 'orthogonal' } }
    expect(canvasSnapshotsEqual(a, b)).toBe(false)
  })

  it('detects an order reordering', () => {
    const a = baseSnapshot()
    const b = baseSnapshot()
    b.order = ['line', 'shape']
    expect(canvasSnapshotsEqual(a, b)).toBe(false)
  })

  it('treats snapshots built with different property insertion order as equal', () => {
    const a = baseSnapshot()
    const b: CanvasSnapshotV1 = {
      order: ['shape', 'line'],
      connectors: {
        line: {
          zIndex: 0,
          routing: 'straight',
          to: { y: 40, x: 30 },
          from: { y: 20, x: 10 },
          id: 'line',
        },
      },
      elements: {
        shape: { zIndex: 1, height: 80, width: 100, y: 20, x: 10, shape: 'rectangle', kind: 'shape', id: 'shape' },
      },
      frame: { autoHeight: true, zIndex: 0, height: 1200, width: 900, y: 0, x: 0 },
      version: CANVAS_SNAPSHOT_VERSION,
    }
    expect(canvasSnapshotsEqual(a, b)).toBe(true)
  })
})
