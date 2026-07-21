import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import NvGlyphPicker from './NvGlyphPicker.vue'
import { WORKSPACE_GLYPHS, glyphToken } from '../../utils/workspaceGlyphs'
import en from '../../locales/en.json'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('NvGlyphPicker', () => {
  it('renders one button per curated glyph', () => {
    const wrapper = mount(NvGlyphPicker, {
      global: { plugins: [i18n] },
      props: { value: '' },
    })

    expect(wrapper.findAll('.nv-glyph-picker__item')).toHaveLength(WORKSPACE_GLYPHS.length)
  })

  it('emits the full glyph:<id> token on select', async () => {
    const glyph = WORKSPACE_GLYPHS[0]
    const wrapper = mount(NvGlyphPicker, {
      global: { plugins: [i18n] },
      props: { value: '' },
    })

    await wrapper.get(`.nv-glyph-picker__item[title="${glyph.label}"]`).trigger('click')

    expect(wrapper.emitted('select')).toEqual([[glyphToken(glyph.id)]])
  })

  it('marks the currently selected glyph', () => {
    const glyph = WORKSPACE_GLYPHS[2]
    const wrapper = mount(NvGlyphPicker, {
      global: { plugins: [i18n] },
      props: { value: glyphToken(glyph.id) },
    })

    const selected = wrapper.get(`.nv-glyph-picker__item[title="${glyph.label}"]`)
    expect(selected.classes()).toContain('is-selected')
  })

  it('emits close on Escape', async () => {
    const wrapper = mount(NvGlyphPicker, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { value: '' },
    })

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('close')).toBeTruthy()
    wrapper.unmount()
  })
})
