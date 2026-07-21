import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import NvIconPicker from './NvIconPicker.vue'
import en from '../../locales/en.json'

vi.mock('./iconPickerEmoji', () => ({
  emojiCategories: [],
  filterUnsupportedEmojisAsync: vi.fn(async () => []),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('NvIconPicker', () => {
  it('focuses the search field when autofocus is enabled', async () => {
    const wrapper = mount(NvIconPicker, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { value: '', autofocus: true },
    })

    await nextTick()

    expect(document.activeElement).toBe(wrapper.get('.nv-icon-picker__search').element)
    wrapper.unmount()
  })
})
