import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../../locales/en.json'
import EditorOutlineRail from './EditorOutlineRail.vue'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

describe('EditorOutlineRail', () => {
  it('marks the active heading and emits the clicked index', async () => {
    const wrapper = mount(EditorOutlineRail, {
      props: {
        items: [{ pos: 0, level: 1, text: 'Intro' }, { pos: 10, level: 2, text: '' }],
        activeIndex: 1,
      },
      global: { plugins: [i18n] },
    })

    const buttons = wrapper.findAll('button')
    expect(wrapper.find('nav').attributes('aria-label')).toBe('Outline')
    expect(buttons[0].text()).toBe('Intro')
    expect(buttons[1].text()).toBe('Untitled heading')
    expect(buttons[0].attributes('aria-current')).toBeUndefined()
    expect(buttons[1].attributes('aria-current')).toBe('location')

    await buttons[0].trigger('click')
    expect(wrapper.emitted('select')).toEqual([[0]])
  })
})
