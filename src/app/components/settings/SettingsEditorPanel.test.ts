import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import SettingsEditorPanel from './SettingsEditorPanel.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings/defaults'
import en from '../../../locales/en.json'

vi.mock('../../../composables/useSystemFonts', () => ({ useSystemFonts: () => ({ fonts: { value: [] } }) }))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

describe('SettingsEditorPanel slash menu layout', () => {
  it('offers three options and stores preview', async () => {
    setActivePinia(createPinia())
    const store = useWorkspaceStore()
    store.settings = createDefaultWorkspaceSettings()
    vi.spyOn(store, 'updateSettings').mockImplementation(async mutator => {
      const draft = structuredClone(store.settings)
      mutator(draft)
      store.settings = draft
    })
    const wrapper = mount(SettingsEditorPanel, { global: { plugins: [i18n] } })
    const group = wrapper.get('[role="group"][aria-label="Slash menu view"]')
    const options = group.findAll('button')
    expect(options.map(option => option.text())).toEqual(['List', 'Tiles', 'Previews'])
    await options[2].trigger('click')
    expect(store.settings.editor.slashMenuLayout).toBe('preview')
  })
})
