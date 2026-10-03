import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import SettingsFilesPanel from './SettingsFilesPanel.vue'
import en from '../../../locales/en.json'

describe('SettingsFilesPanel', () => {
  it('renders archive retention as a styled segmented choice', () => {
    setActivePinia(createPinia())
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const wrapper = mount(SettingsFilesPanel, { global: { plugins: [i18n] } })
    const choices = wrapper.get('[role="group"][aria-label="Archive retention"]').findAll('button')

    expect(choices).toHaveLength(4)
    expect(choices.every(choice => choice.classes().includes('segmented__item'))).toBe(true)
    expect(choices.filter(choice => choice.attributes('aria-pressed') === 'true')).toHaveLength(1)

    wrapper.unmount()
  })
})
