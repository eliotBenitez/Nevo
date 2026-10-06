import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import HomeFavorites from './HomeFavorites.vue'
import en from '../../../locales/en.json'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

describe('HomeFavorites', () => {
  it('renders the empty prompt as a size container', () => {
    const wrapper = mount(HomeFavorites, {
      props: { favoriteItems: [], isWorkspaceEmpty: false },
      global: { plugins: [i18n] },
    })
    const section = wrapper.find('.workspace-home__favorite-prompt')
    expect(section.exists()).toBe(true)
    expect(section.classes()).toContain('tw:@container')
  })
})
