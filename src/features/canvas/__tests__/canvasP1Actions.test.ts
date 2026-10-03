import { describe, expect, it } from 'vitest'
import { CanvasStore, type CanvasElement, type CanvasStrokeElement } from '../../../core/canvas'
import { useCanvasP1Elements } from '../composables/useCanvasP1Elements'

function setup() {
  const store = new CanvasStore()
  store.load(undefined)
  store.replace({
    version: 1,
    frame: { x: 0, y: 0, width: 800, height: 600, zIndex: 0 },
    elements: {},
    connectors: {},
    order: [],
  })
  const actions = useCanvasP1Elements({ getStore: () => store })
  return { store, actions }
}

describe('canvas P1 element actions', () => {
  it('creates rich notes, note links, and ordered presentation frames', () => {
    const { store, actions } = setup()
    const noteId = actions.addRichNote(20, 30)
    const linkId = actions.addNoteLink(340, 30, { id: 'target', title: 'Target note', icon: '🧭' })
    const firstFrame = actions.addFrame(0, 0, {}, 'Intro')
    const secondFrame = actions.addFrame(1000, 0, {}, 'Details')
    actions.setRichText(noteId, {
      blocks: [{ type: 'heading', level: 2, spans: [{ text: 'Roadmap', marks: ['bold'] }] }],
    })

    const elements = store.snapshot.elements
    expect(elements[noteId]).toMatchObject({
      kind: 'note',
      content: { blocks: [{ type: 'heading', spans: [{ text: 'Roadmap' }] }] },
    })
    expect(elements[linkId]).toMatchObject({ kind: 'note-link', noteId: 'target', icon: '🧭' })
    expect(elements[firstFrame]).toMatchObject({ kind: 'frame', presentationOrder: 0 })
    expect(elements[secondFrame]).toMatchObject({ kind: 'frame', presentationOrder: 1 })
  })

  it('adds and lays out a bound mind-map child in one gesture', () => {
    const { store, actions } = setup()
    const rootId = actions.addMindMapRoot(100, 100, 'Root')
    const childId = actions.addMindMapChild(rootId)
    const child = store.snapshot.elements[childId]
    const connector = Object.values(store.snapshot.connectors)[0]

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
    const { store, actions } = setup()
    store.replace({
      version: 1,
      frame: { x: 0, y: 0, width: 800, height: 600, zIndex: 0 },
      elements: {
        stroke: {
          id: 'stroke',
          kind: 'freehand',
          points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
          x: 0,
          y: 0,
          width: 100,
          height: 1,
          zIndex: 1,
        },
      },
      connectors: {
        edge: {
          id: 'edge',
          from: { x: 0, y: 0, binding: { target: 'element', targetId: 'stroke' } },
          to: { x: 120, y: 0 },
          routing: 'straight',
          zIndex: 0,
        },
      },
      order: ['stroke', 'edge'],
    })

    expect(actions.eraseStrokeParts([{ x: 50, y: -10 }, { x: 50, y: 10 }], 8)).toEqual(['stroke'])
    const strokes = Object.values(store.snapshot.elements).filter(
      (element: CanvasElement): element is CanvasStrokeElement => element.kind === 'freehand',
    )
    expect(strokes).toHaveLength(2)
    expect(strokes[0].points[strokes[0].points.length - 1].x).toBeLessThan(43)
    expect(strokes[1].points[0].x).toBeGreaterThan(57)
    expect(store.snapshot.connectors.edge?.from.binding).toBeUndefined()
  })
})
