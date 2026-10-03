import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import SettingsAdvancedPanel from './SettingsAdvancedPanel.vue'
import en from '../../../locales/en.json'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { AppMetadata } from '../../../types/workspace'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

describe('SettingsAdvancedPanel', () => {
  it('shows file-manager actions only when the platform supports them', () => {
    setActivePinia(createPinia())
    const store = useWorkspaceStore()
    store.appMetadata = { runtime: 'android', supportsRevealInFileManager: false } as AppMetadata
    const mobile = mount(SettingsAdvancedPanel, { global: { plugins: [i18n] } })

    expect(mobile.text()).not.toContain(i18n.global.t('settings.advanced.revealLogs.action'))
    expect(mobile.text()).not.toContain(i18n.global.t('settings.advanced.rawSettings.reveal'))
    mobile.unmount()

    store.appMetadata = { runtime: 'desktop', supportsRevealInFileManager: true } as AppMetadata
    const desktop = mount(SettingsAdvancedPanel, { global: { plugins: [i18n] } })

    expect(desktop.text()).toContain(i18n.global.t('settings.advanced.revealLogs.action'))
    expect(desktop.text()).toContain(i18n.global.t('settings.advanced.rawSettings.reveal'))
    desktop.unmount()
  })
})
