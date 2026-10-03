import { describe, expect, it } from 'vitest'
import { CanvasStore, type CanvasClipboardPayload } from '../../../core/canvas'
import { useCanvasElements } from '../composables/useCanvasElements'

function strokePayload(): CanvasClipboardPayload {
  return {
    version: 1,
    elements: [{
      id: 'stroke',
      kind: 'freehand',
      x: 10,
      y: 20,
      width: 20,
      height: 10,
      zIndex: 0,
      points: [{ x: 10, y: 20, pressure: 0.2 }, { x: 30, y: 30, pressure: 0.8 }],
    }],
    connectors: [],
  }
}

function setupStore() {
  const store = new CanvasStore()
  store.load(undefined)
  return store
}

describe('canvas element actions', () => {
  it('moves, resizes, and duplicates world-space stroke points with their bounds', () => {
    const store = setupStore()
    store.replace({
      version: 1,
      frame: { x: 0, y: 0, width: 800, height: 600, zIndex: 0 },
      elements: { stroke: strokePayload().elements[0] },
      connectors: {},
      order: ['stroke'],
    })
    const actions = useCanvasElements({ getStore: () => store })

    actions.moveElement('stroke', 50, 70)
    expect(store.snapshot.elements.stroke).toMatchObject({
      x: 50,
      y: 70,
      points: [{ x: 50, y: 70 }, { x: 70, y: 80 }],
    })

    actions.resizeElement('stroke', 40, 20)
    expect(store.snapshot.elements.stroke).toMatchObject({
      width: 40,
      height: 24,
      points: [{ x: 50, y: 70 }, { x: 90, y: 94 }],
    })

    const [copyId] = actions.insertClipboard(strokePayload(), { x: 24, y: 12 })
    expect(store.snapshot.elements[copyId]).toMatchObject({
      x: 34,
      y: 32,
      points: [{ x: 34, y: 32 }, { x: 54, y: 42 }],
    })
  })

  it('resizes a text element to fit new text, but leaves a shape label\'s box alone', () => {
    const store = setupStore()
    store.replace({
      version: 1,
      frame: { x: 0, y: 0, width: 800, height: 600, zIndex: 0 },
      elements: {
        text: { id: 'text', kind: 'text', text: 'hi', x: 0, y: 0, width: 40, height: 32, zIndex: 0, style: { fontSize: 16 } },
        shape: { id: 'shape', kind: 'shape', shape: 'rectangle', text: 'hi', x: 0, y: 0, width: 220, height: 140, zIndex: 1 },
      },
      connectors: {},
      order: ['text', 'shape'],
    })
    const actions = useCanvasElements({ getStore: () => store })

    actions.setText('text', 'a much longer line of text than before')
    const resizedText = store.snapshot.elements.text
    expect(resizedText?.width).toBeGreaterThan(40)

    actions.setText('shape', 'a much longer line of text than before')
    const shape = store.snapshot.elements.shape
    expect(shape).toMatchObject({ width: 220, height: 140 })
  })

  it('resizes a text element when fontSize or fontFamily changes via patchStyle, but not a shape', () => {
    const store = setupStore()
    store.replace({
      version: 1,
      frame: { x: 0, y: 0, width: 800, height: 600, zIndex: 0 },
      elements: {
        text: { id: 'text', kind: 'text', text: 'hello', x: 0, y: 0, width: 40, height: 32, zIndex: 0, style: { fontSize: 16 } },
        shape: { id: 'shape', kind: 'shape', shape: 'rectangle', text: 'hello', x: 0, y: 0, width: 220, height: 140, zIndex: 1, style: { fontSize: 16 } },
      },
      connectors: {},
      order: ['text', 'shape'],
    })
    const actions = useCanvasElements({ getStore: () => store })

    const before = store.snapshot.elements.text

    actions.patchStyle(['text', 'shape'], { fontSize: 64 })

    const resizedText = store.snapshot.elements.text
    expect(resizedText?.height).toBeGreaterThan(before!.height)
    expect(resizedText?.width).toBeGreaterThan(before!.width)

    const shape = store.snapshot.elements.shape
    expect(shape).toMatchObject({ width: 220, height: 140 })

    // A style patch unrelated to font metrics does not resize the text box.
    const stable = store.snapshot.elements.text
    actions.patchStyle(['text'], { textColor: '#ff0000' })
    expect(store.snapshot.elements.text).toMatchObject({
      width: stable!.width,
      height: stable!.height,
    })
  })
})
