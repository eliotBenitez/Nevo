import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { getCanvasSharedTypes, replaceCanvasSnapshot, type CanvasElement, type CanvasStrokeElement } from '../../../core/canvas'
import { useCanvasP1Elements } from '../composables/useCanvasP1Elements'

function setup() {
  const ydoc = new Y.Doc()
  replaceCanvasSnapshot(ydoc, {
    version: 1,
    frame: { x: 0, y: 0, width: 800, height: 600, zIndex: 0 },
    elements: {},
    connectors: {},
    order: [],
  })
  const actions = useCanvasP1Elements({ getYDoc: () => ydoc, getUndoManager: () => null })
  return { ydoc, actions }
}

describe('canvas P1 element actions', () => {
  it('creates rich notes, note links, and ordered presentation frames', () => {
    const { ydoc, actions } = setup()
    const noteId = actions.addRichNote(20, 30)
    const linkId = actions.addNoteLink(340, 30, { id: 'target', title: 'Target note', icon: '🧭' })
    const firstFrame = actions.addFrame(0, 0, {}, 'Intro')
    const secondFrame = actions.addFrame(1000, 0, {}, 'Details')
    actions.setRichText(noteId, {
      blocks: [{ type: 'heading', level: 2, spans: [{ text: 'Roadmap', marks: ['bold'] }] }],
    })

    const elements = getCanvasSharedTypes(ydoc).elements
    expect(elements.get(noteId)).toMatchObject({
      kind: 'note',
      content: { blocks: [{ type: 'heading', spans: [{ text: 'Roadmap' }] }] },
    })
    expect(elements.get(linkId)).toMatchObject({ kind: 'note-link', noteId: 'target', icon: '🧭' })
    expect(elements.get(firstFrame)).toMatchObject({ kind: 'frame', presentationOrder: 0 })
    expect(elements.get(secondFrame)).toMatchObject({ kind: 'frame', presentationOrder: 1 })
  })

  it('adds and lays out a bound mind-map child in one gesture', () => {
    const { ydoc, actions } = setup()
    const rootId = actions.addMindMapRoot(100, 100, 'Root')
    const childId = actions.addMindMapChild(rootId)
    const types = getCanvasSharedTypes(ydoc)
    const child = types.elements.get(childId)
    const connector = Array.from(types.connectors.values())[0]

    expect(child).toMatchObject({
      kind: 'shape',
      mindMap: { mapId: rootId, parentId: rootId, rank: 0 },
      x: 412,
    })
    expect(connector).toMatchObject({
      routing: 'bezier',
      from: { binding: { targetId: rootId, side: 'right' } },
      to: { binding: { targetId: childId, side: 'left' } },
    })
  })

  it('replaces only the erased part of a stroke and preserves both remnants', () => {
    const { ydoc, actions } = setup()
    const types = getCanvasSharedTypes(ydoc)
    types.elements.set('stroke', {
      id: 'stroke',
      kind: 'freehand',
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      x: 0,
      y: 0,
      width: 100,
      height: 1,
      zIndex: 1,
    })
    types.order.push(['stroke'])
    types.connectors.set('edge', {
      id: 'edge',
      from: { x: 0, y: 0, binding: { target: 'element', targetId: 'stroke' } },
      to: { x: 120, y: 0 },
      routing: 'straight',
      zIndex: 0,
    })

    expect(actions.eraseStrokeParts([{ x: 50, y: -10 }, { x: 50, y: 10 }], 8)).toEqual(['stroke'])
    const strokes = Array.from(types.elements.values()).filter(
      (element: CanvasElement): element is CanvasStrokeElement => element.kind === 'freehand',
    )
    expect(strokes).toHaveLength(2)
    expect(strokes[0].points[strokes[0].points.length - 1].x).toBeLessThan(43)
    expect(strokes[1].points[0].x).toBeGreaterThan(57)
    expect(types.connectors.get('edge')?.from.binding).toBeUndefined()
  })
})
