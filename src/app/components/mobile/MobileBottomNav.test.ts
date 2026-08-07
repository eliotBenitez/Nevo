import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import en from '../../../locales/en.json'
import MobileBottomNav from './MobileBottomNav.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

describe('MobileBottomNav', () => {
  it('marks the active destination and emits navigation actions', async () => {
    const onNavigate = vi.fn()
    const wrapper = mount(MobileBottomNav, {
      props: { active: 'notes', onNavigate },
      global: { plugins: [i18n] },
    })

    const current = wrapper.get('[aria-current="page"]')
    expect(current.text()).toContain('Notes')

    const buttons = wrapper.findAll('button')
    await buttons[2].trigger('click')
    await buttons[4].trigger('click')

    expect(onNavigate).toHaveBeenNthCalledWith(1, 'search')
    expect(onNavigate).toHaveBeenNthCalledWith(2, 'more')
  })
})
