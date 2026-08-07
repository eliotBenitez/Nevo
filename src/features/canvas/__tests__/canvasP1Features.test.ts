import { computed, defineComponent, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { CanvasElement, CanvasSnapshotV1 } from '../../../core/canvas'
import { useCanvasP1Features } from '../composables/useCanvasP1Features'

describe('useCanvasP1Features', () => {
  it('opens linked notes from canvas cards', () => {
    const snapshot = ref<CanvasSnapshotV1>({
      version: 1,
      frame: { x: 0, y: 0, width: 800, height: 600, zIndex: 0 },
      elements: {
        link: {
          id: 'link',
          kind: 'note-link',
          noteId: 'target-note',
          title: 'Target',
          x: 0,
          y: 0,
          width: 280,
          height: 104,
          zIndex: 1,
        },
      },
      connectors: {},
      order: ['link'],
    })
    const openNote = vi.fn()
    let features!: ReturnType<typeof useCanvasP1Features>
    const Host = defineComponent({
      setup() {
        features = useCanvasP1Features({
          snapshot,
          camera: { x: 0, y: 0, zoom: 1 },
          actions: {
            addNoteLink: vi.fn(() => ''),
            addMindMapChild: vi.fn(() => ''),
            layoutMindMap: vi.fn(() => false),
            setRichText: vi.fn(),
            updateElement: vi.fn(() => false),
          },
          selectedElement: computed<CanvasElement | null>(() => snapshot.value.elements.link),
          select: vi.fn(),
          editText: vi.fn(),
          returnToSelect: vi.fn(),
          focusFrame: vi.fn(),
          openNote,
        })
        return () => null
      },
    })
    const wrapper = mount(Host)

    expect(features.editItem('link')).toBe(true)
    expect(openNote).toHaveBeenCalledWith('target-note')

    wrapper.unmount()
  })
})
