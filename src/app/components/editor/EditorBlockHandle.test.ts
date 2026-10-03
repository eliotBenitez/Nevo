import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it } from 'vitest'
import { BarChart3, Image as ImageIcon, Pilcrow } from 'lucide-vue-next'
import EditorBlockHandle from './EditorBlockHandle.vue'
import en from '../../../locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function mountHandle(hoveredBlockTypeName: string) {
  return mount(EditorBlockHandle, {
    props: {
      visible: true,
      position: { top: 0, left: 0 },
      hoveredBlockTypeName,
      hoveredBlockIconAttrs: null,
    },
    global: { plugins: [i18n] },
  })
}

describe('EditorBlockHandle', () => {
  it('shows the chart icon for Vega blocks and updates it when the hovered block changes', async () => {
    const wrapper = mountHandle('paragraph')

    expect(wrapper.findComponent(Pilcrow).exists()).toBe(true)

    await wrapper.setProps({ hoveredBlockTypeName: 'vega_block' })
    expect(wrapper.findComponent(BarChart3).exists()).toBe(true)
    expect(wrapper.findComponent(Pilcrow).exists()).toBe(false)

    await wrapper.setProps({ hoveredBlockTypeName: 'image_block' })
    expect(wrapper.findComponent(ImageIcon).exists()).toBe(true)
  })
})
