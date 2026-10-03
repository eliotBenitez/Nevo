import { describe, expect, it } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import EditorFloatingToolbar from './EditorFloatingToolbar.vue'
import en from '../../../locales/en.json'

function mountToolbar(activeMarks: string[]) {
  return shallowMount(EditorFloatingToolbar, {
    props: {
      visible: true,
      toolbarStyle: {},
      activeMarks: new Set(activeMarks),
      pluginActions: [],
    },
    global: {
      plugins: [createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
}

describe('EditorFloatingToolbar', () => {
  it('exposes mark toggle state to assistive technology', () => {
    const wrapper = mountToolbar(['strong', 'code'])
    const byLabel = (label: string) => wrapper.get(`button[aria-label="${label}"]`)

    expect(byLabel(en.editor.toolbar.bold).attributes('aria-pressed')).toBe('true')
    expect(byLabel(en.editor.toolbar.code).attributes('aria-pressed')).toBe('true')
    expect(byLabel(en.editor.toolbar.italic).attributes('aria-pressed')).toBe('false')
    expect(byLabel(en.editor.toolbar.subscript).attributes('aria-pressed')).toBe('false')
  })

  it('marks picker buttons as popups rather than toggles', () => {
    const wrapper = mountToolbar(['link'])
    const link = wrapper.get(`button[aria-label="${en.editor.toolbar.link}"]`)

    expect(link.attributes('aria-haspopup')).toBe('true')
    expect(link.attributes('aria-pressed')).toBeUndefined()
    expect(link.classes()).toContain('is-active')
  })
})
