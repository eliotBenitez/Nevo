import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../locales/en.json'
import TitleBarSearch from './TitleBarSearch.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

describe('TitleBarSearch', () => {
  it('renders a trigger button with the placeholder label and shortcut hint', () => {
    const wrapper = mount(TitleBarSearch, {
      global: {
        plugins: [i18n],
      },
      props: {
        searchShortcut: 'Ctrl+P',
      },
    })

    const button = wrapper.get('button')
    expect(button.text()).toContain('Search notes, blocks, settings...')
    expect(button.text()).toContain('Ctrl')
    expect(button.text()).toContain('P')
    expect(button.attributes('aria-label')).toBeTruthy()

    wrapper.unmount()
  })

  it('emits open when clicked', async () => {
    const wrapper = mount(TitleBarSearch, {
      global: {
        plugins: [i18n],
      },
      props: {
        searchShortcut: 'Ctrl+P',
      },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('open')).toHaveLength(1)

    wrapper.unmount()
  })

  it('renders without a shortcut hint when none is provided', () => {
    const wrapper = mount(TitleBarSearch, {
      global: {
        plugins: [i18n],
      },
      props: {},
    })

    expect(wrapper.find('kbd').exists()).toBe(false)

    wrapper.unmount()
  })
})
