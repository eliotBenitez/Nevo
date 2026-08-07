import { describe, expect, it } from 'vitest'
import {
  canvasRichTextFromPlainText,
  canvasRichTextToPlainText,
  eraseStrokeSegments,
  layoutMindMap,
  normalizeCanvasSnapshot,
  type CanvasConnector,
  type CanvasElement,
} from '..'

describe('canvas P1 tools', () => {
  it('normalizes rich notes, note links, frames, and mind-map metadata', () => {
    const snapshot = normalizeCanvasSnapshot({
      version: 1,
      frame: { x: 0, y: 0, width: 800, height: 600, zIndex: 0 },
      elements: {
        note: {
          id: 'note',
          kind: 'note',
          x: 0,
          y: 0,
          width: 300,
          height: 200,
          zIndex: 1,
          content: { blocks: [{ type: 'heading', level: 2, spans: [{ text: 'Plan', marks: ['bold', 'unsafe'] }] }] },
        },
        link: {
          id: 'link',
          kind: 'note-link',
          noteId: 'target-note',
          title: 'Target',
          x: 400,
          y: 0,
          width: 280,
          height: 104,
          zIndex: 2,
        },
        frame: {
          id: 'frame',
          kind: 'frame',
          title: 'Opening',
          presentationOrder: 3,
          x: 0,
          y: 300,
          width: 960,
          height: 540,
          zIndex: -9,
        },
        root: {
          id: 'root',
          kind: 'shape',
          shape: 'rectangle',
          mindMap: { mapId: 'root', rank: 0 },
          x: 0,
          y: 900,
          width: 220,
          height: 84,
          zIndex: 3,
        },
      },
      connectors: {},
      order: ['frame', 'note', 'link', 'root'],
    })

    expect(snapshot?.elements.note).toMatchObject({
      kind: 'note',
      content: { blocks: [{ type: 'heading', level: 2, spans: [{ text: 'Plan', marks: ['bold'] }] }] },
    })
    expect(snapshot?.elements.link).toMatchObject({ kind: 'note-link', noteId: 'target-note' })
    expect(snapshot?.elements.frame).toMatchObject({ kind: 'frame', presentationOrder: 3 })
    expect(snapshot?.elements.root).toMatchObject({ kind: 'shape', mindMap: { mapId: 'root', rank: 0 } })
  })

  it('round-trips rich block text without HTML', () => {
    const document = canvasRichTextFromPlainText('First\nSecond')
    document.blocks[0].type = 'todo'
    document.blocks[0].checked = true
    document.blocks[1].type = 'quote'
    expect(canvasRichTextToPlainText(document)).toBe('☑ First\n“Second”')
  })

  it('splits a stroke on both sides of an eraser trail', () => {
    const segments = eraseStrokeSegments(
      [{ x: 0, y: 0, pressure: 0.2 }, { x: 100, y: 0, pressure: 0.8 }],
      [{ x: 50, y: -10 }, { x: 50, y: 10 }],
      8,
    )
    expect(segments).toHaveLength(2)
    expect(segments[0][segments[0].length - 1].x).toBeLessThan(43)
    expect(segments[1][0].x).toBeGreaterThan(57)
    expect(segments[0][0].pressure).toBe(0.2)
    expect(eraseStrokeSegments(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [{ x: 50, y: 100 }],
      8,
    )).toEqual([[{ x: 0, y: 0 }, { x: 100, y: 0 }]])
  })

  it('lays out a mind map and reflows bound connectors', () => {
    const elements: Record<string, CanvasElement> = {
      root: {
        id: 'root',
        kind: 'shape',
        shape: 'rectangle',
        text: 'Root',
        mindMap: { mapId: 'map', rank: 0 },
        x: 100,
        y: 100,
        width: 220,
        height: 84,
        zIndex: 1,
      },
      child: {
        id: 'child',
        kind: 'shape',
        shape: 'rectangle',
        text: 'Child',
        mindMap: { mapId: 'map', parentId: 'root', rank: 0 },
        x: 0,
        y: 0,
        width: 200,
        height: 72,
        zIndex: 2,
      },
    }
    const connectors: Record<string, CanvasConnector> = {
      edge: {
        id: 'edge',
        from: { x: 0, y: 0, binding: { target: 'element', targetId: 'root' } },
        to: { x: 0, y: 0, binding: { target: 'element', targetId: 'child' } },
        routing: 'bezier',
        zIndex: 0,
      },
    }
    const layout = layoutMindMap(elements, connectors, 'map')
    expect(layout.elements.child.x).toBe(412)
    expect(layout.connectors.edge.from).toMatchObject({ x: 320, binding: { side: 'right' } })
    expect(layout.connectors.edge.to).toMatchObject({ x: 412, binding: { side: 'left' } })
  })
})
