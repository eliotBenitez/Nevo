import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import type { CanvasConnector, CanvasImageElement, CanvasShapeElement } from '../../../core/canvas'
import en from '../../../locales/en.json'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvColorPicker from '../../../ui/primitives/NvColorPicker.vue'
import NvNumberInput from '../../../ui/primitives/NvNumberInput.vue'
import NvRangeInput from '../../../ui/primitives/NvRangeInput.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvTextInput from '../../../ui/primitives/NvTextInput.vue'
import CanvasPropertiesPanel from '../components/CanvasPropertiesPanel.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

const labels: Record<string, string> = {
  properties: 'Properties',
  fill: 'Fill',
  stroke: 'Stroke',
  strokeWidth: 'Stroke width',
  opacity: 'Opacity',
  fontSize: 'Font size',
  textColor: 'Text color',
  fontFamily: 'Font',
  fontSans: 'Sans',
  fontSerif: 'Serif',
  fontMono: 'Mono',
  fontHandwriting: 'Handwriting',
  rotation: 'Rotation',
  alt: 'Alternative text',
  routing: 'Routing',
  straight: 'Straight',
  orthogonal: 'Orthogonal',
  bezier: 'Bezier',
  startCap: 'Start cap',
  endCap: 'End cap',
  none: 'None',
  arrow: 'Arrow',
  dot: 'Dot',
  left: 'Align left',
  center: 'Align center',
  right: 'Align right',
  top: 'Align top',
  middle: 'Align middle',
  bottom: 'Align bottom',
  distributeHorizontal: 'Distribute horizontally',
  distributeVertical: 'Distribute vertically',
  duplicate: 'Duplicate',
  front: 'Bring to front',
  forward: 'Bring forward',
  backward: 'Send backward',
  back: 'Send to back',
  group: 'Group',
  ungroup: 'Ungroup',
  lock: 'Lock',
  unlock: 'Unlock',
  frameTitle: 'Frame title',
  presentationOrder: 'Presentation order',
  openLinkedNote: 'Open linked note',
  addMindMapChild: 'Add child',
  layoutMindMap: 'Layout mind map',
}

const shape: CanvasShapeElement = {
  id: 'shape-1',
  kind: 'shape',
  shape: 'rectangle',
  x: 20,
  y: 30,
  width: 180,
  height: 100,
  zIndex: 1,
  rotation: 15,
  style: {
    fill: '#ffffff',
    stroke: '#171717',
    strokeWidth: 3,
    opacity: 0.75,
    fontSize: 18,
  },
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('CanvasPropertiesPanel', () => {
  it('uses shared primitives and preserves element property events', async () => {
    const onStyle = vi.fn()
    const onRotation = vi.fn()
    const onDuplicate = vi.fn()
    const wrapper = mount(CanvasPropertiesPanel, {
      global: { plugins: [i18n] },
      props: {
        selectionCount: 2,
        element: shape,
        connector: null,
        selectionLocked: false,
        labels,
        onStyle,
        onRotation,
        onDuplicate,
      },
    })

    // fill, stroke, text color (the shape has a label, so supportsText is true)
    expect(wrapper.findAllComponents(NvColorPicker)).toHaveLength(3)
    expect(wrapper.findAllComponents(NvRangeInput)).toHaveLength(2)
    expect(wrapper.findAllComponents(NvNumberInput)).toHaveLength(2)
    expect(wrapper.findAllComponents(NvSelect)).toHaveLength(1)
    expect(wrapper.findAllComponents(NvButton)).toHaveLength(16)

    wrapper.findAllComponents(NvColorPicker)[0].vm.$emit('update:modelValue', '#a16207')
    wrapper.findAllComponents(NvColorPicker)[2].vm.$emit('update:modelValue', '#0ea5e9')
    wrapper.findAllComponents(NvRangeInput)[0].vm.$emit('update:modelValue', 7)
    wrapper.findAllComponents(NvNumberInput)[1].vm.$emit('update:modelValue', 45)
    wrapper.findAllComponents(NvSelect)[0].vm.$emit('update:modelValue', 'serif')
    await wrapper.get('[aria-label="Duplicate"]').trigger('click')
    await nextTick()

    expect(onStyle).toHaveBeenCalledWith({ fill: '#a16207' })
    expect(onStyle).toHaveBeenCalledWith({ textColor: '#0ea5e9' })
    expect(onStyle).toHaveBeenCalledWith({ strokeWidth: 7 })
    expect(onStyle).toHaveBeenCalledWith({ fontFamily: 'serif' })
    expect(onRotation).toHaveBeenCalledWith(45)
    expect(onDuplicate).toHaveBeenCalledOnce()
  })

  it('uses select primitives for connector routing and caps', async () => {
    const connector: CanvasConnector = {
      id: 'connector-1',
      from: { x: 0, y: 0 },
      to: { x: 200, y: 100 },
      routing: 'straight',
      zIndex: 2,
      startCap: 'none',
      endCap: 'arrow',
    }
    const onConnector = vi.fn()
    const wrapper = mount(CanvasPropertiesPanel, {
      global: { plugins: [i18n] },
      props: {
        selectionCount: 1,
        element: null,
        connector,
        selectionLocked: false,
        labels,
        onConnector,
      },
    })

    expect(wrapper.findAllComponents(NvColorPicker)).toHaveLength(1)
    expect(wrapper.findAllComponents(NvRangeInput)).toHaveLength(1)
    expect(wrapper.findAllComponents(NvSelect)).toHaveLength(3)

    wrapper.findAllComponents(NvSelect)[0].vm.$emit('update:modelValue', 'orthogonal')
    wrapper.findAllComponents(NvSelect)[1].vm.$emit('update:modelValue', 'dot')
    await nextTick()

    expect(onConnector).toHaveBeenCalledWith({ routing: 'orthogonal' })
    expect(onConnector).toHaveBeenCalledWith({ startCap: 'dot' })
  })

  it('commits image alternative text through the text input primitive', async () => {
    const image: CanvasImageElement = {
      id: 'image-1',
      kind: 'image',
      src: 'asset://diagram.png',
      alt: 'Diagram',
      x: 0,
      y: 0,
      width: 320,
      height: 180,
      zIndex: 1,
    }
    const onAlt = vi.fn()
    const wrapper = mount(CanvasPropertiesPanel, {
      global: { plugins: [i18n] },
      props: {
        selectionCount: 1,
        element: image,
        connector: null,
        selectionLocked: false,
        labels,
        onAlt,
      },
    })

    expect(wrapper.findComponent(NvTextInput).exists()).toBe(true)

    wrapper.findComponent(NvTextInput).vm.$emit('change', 'Updated diagram')
    await nextTick()

    expect(onAlt).toHaveBeenCalledWith('Updated diagram')
  })
})
