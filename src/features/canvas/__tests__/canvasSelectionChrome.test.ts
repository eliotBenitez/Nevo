import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, reactive, ref, shallowRef } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import {
  createDefaultCanvasFrame,
  type CanvasBounds,
  type CanvasElement,
  type CanvasSnapshotV1,
} from '../../../core/canvas'
import { useCanvasPointerInteraction } from '../composables/useCanvasPointerInteraction'

function shape(id: string, rotation?: number): CanvasElement {
  return {
    id,
    kind: 'shape',
    shape: 'rectangle',
    x: 100,
    y: 50,
    width: 200,
    height: 80,
    zIndex: 1,
    ...(rotation === undefined ? {} : { rotation }),
  }
}

function mountInteraction(elements: CanvasElement[], selectedIds: string[]) {
  const snapshot: CanvasSnapshotV1 = {
    version: 1,
    frame: createDefaultCanvasFrame(),
    elements: Object.fromEntries(elements.map(element => [element.id, element])),
    connectors: {},
    order: elements.map(element => element.id),
  }
  const elementDrafts = reactive<Record<string, Partial<CanvasElement>>>({})
  const captured: { api: ReturnType<typeof useCanvasPointerInteraction> | null } = { api: null }
  const Host = defineComponent({
    setup() {
      captured.api = useCanvasPointerInteraction({
        snapshot: shallowRef(snapshot),
        camera: { x: 0, y: 0, zoom: 1 },
        cameraView: reactive({ x: 0, y: 0, zoom: 1 }),
        effectiveFrame: shallowRef<CanvasBounds>({ x: 0, y: 0, width: 900, height: 1200 }),
        viewport: ref(document.createElement('div') as HTMLDivElement),
        selectedIds: ref(selectedIds),
        spacePressed: ref(false),
        marquee: ref(null),
        elementDrafts,
        actions: {
          moveFrame: vi.fn(),
          previewFrame: vi.fn(),
          resizeFrame: vi.fn(),
          moveElement: vi.fn(),
          resizeElement: vi.fn(),
        },
        getEditorView: () => null,
        panBy: vi.fn(),
        zoomAt: vi.fn(),
      })
      return () => null
    },
  })
  const wrapper = mount(Host)
  if (!captured.api) throw new Error('useCanvasPointerInteraction did not initialize')
  return { wrapper, api: captured.api, elementDrafts }
}

describe('selection chrome geometry', () => {
  let wrapper: VueWrapper | null = null

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('rotates the chrome with the element it outlines', () => {
    const mounted = mountInteraction([shape('a', 30)], ['a'])
    wrapper = mounted.wrapper

    expect(mounted.api.selectionChromeStyle.value).toMatchObject({
      left: '100px',
      top: '50px',
      width: '200px',
      height: '80px',
      transform: 'rotate(30deg)',
      transformOrigin: 'center',
    })
  })

  it('omits the transform for an unrotated element', () => {
    const mounted = mountInteraction([shape('a')], ['a'])
    wrapper = mounted.wrapper

    expect(mounted.api.selectionChromeStyle.value).not.toHaveProperty('transform')
  })

  // The live rotation gesture writes into the drafts map, so the outline has to
  // follow the draft angle rather than the last committed one.
  it('follows the in-flight rotation draft', async () => {
    const mounted = mountInteraction([shape('a', 10)], ['a'])
    wrapper = mounted.wrapper

    mounted.elementDrafts.a = { rotation: 75 }
    await wrapper.vm.$nextTick()

    expect(mounted.api.selectionChromeStyle.value).toMatchObject({ transform: 'rotate(75deg)' })
  })

  // A multi-selection's union box is axis-aligned; there is no single angle.
  it('keeps a multi-selection box unrotated', () => {
    const mounted = mountInteraction([shape('a', 30), shape('b', 45)], ['a', 'b'])
    wrapper = mounted.wrapper

    expect(mounted.api.selectionChromeStyle.value).not.toHaveProperty('transform')
  })
})
