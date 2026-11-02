import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import SettingsEditorPanel from './SettingsEditorPanel.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
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
    const select = wrapper.findAllComponents(NvSelect).find(s => s.props('ariaLabel') === 'Slash menu view')!
    expect(select.props('options').map(option => option.label)).toEqual(['List', 'Tiles', 'Previews'])
    select.vm.$emit('update:modelValue', 'preview')
    await wrapper.vm.$nextTick()
    expect(store.settings.editor.slashMenuLayout).toBe('preview')
  })
})
