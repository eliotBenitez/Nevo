import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import EditorVegaPopover from './EditorVegaPopover.vue'
import en from '../../../locales/en.json'
import ru from '../../../locales/ru.json'

describe('EditorVegaPopover', () => {
  it('mounts with the raw Vega-Lite JSON placeholder from locale messages', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: { en, ru },
    })

    const wrapper = mount(EditorVegaPopover, {
      global: {
        plugins: [i18n],
      },
      props: {
        open: true,
        spec: '{}',
        popoverStyle: {},
      },
    })

    const placeholder = wrapper.get('textarea').attributes('placeholder') ?? ''
    expect(placeholder).toContain('"$schema"')
    expect(placeholder).toContain('https://vega.github.io/schema/vega-lite/v5.json')
    expect(wrapper.get('form').classes()).toContain('editor-popup-panel')
    expect(wrapper.get('form').classes()).toContain('vega-popover')

    wrapper.unmount()
  })
})
