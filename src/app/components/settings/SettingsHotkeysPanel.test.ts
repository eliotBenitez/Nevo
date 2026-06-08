import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import SettingsHotkeysPanel from './SettingsHotkeysPanel.vue'
import en from '../../../locales/en.json'
import { useWorkspaceStore } from '../../../stores/workspace'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function mountPanel() {
  setActivePinia(createPinia())
  const workspaceStore = useWorkspaceStore()
  workspaceStore.settings = createDefaultWorkspaceSettings()

  return mount(SettingsHotkeysPanel, {
    global: {
      plugins: [i18n],
    },
  })
}

describe('SettingsHotkeysPanel', () => {
  it('keeps editor formatting shortcuts visible but not editable', () => {
    const wrapper = mountPanel()

    const boldRow = wrapper.findAll('.shortcut-row').find(row => row.text().includes('core.bold'))
    const searchRow = wrapper.findAll('.shortcut-row').find(row => row.text().includes('workspace.search'))

    expect(boldRow?.text()).toContain('Fixed')
    expect(boldRow?.find('.hotkey-input').attributes('disabled')).toBeDefined()
    expect(searchRow?.find('.hotkey-input').attributes('disabled')).toBeUndefined()

    wrapper.unmount()
  })
})
