import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import SettingsFilesPanel from './SettingsFilesPanel.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings/defaults'
import en from '../../../locales/en.json'

describe('SettingsFilesPanel', () => {
  it('renders archive retention as a select and stores the chosen days as a number', async () => {
    setActivePinia(createPinia())
    const store = useWorkspaceStore()
    store.settings = createDefaultWorkspaceSettings()
    vi.spyOn(store, 'updateSettings').mockImplementation(async mutator => {
      const draft = structuredClone(store.settings)
      mutator(draft)
      store.settings = draft
    })
    const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
    const wrapper = mount(SettingsFilesPanel, { global: { plugins: [i18n] } })
    const select = wrapper.findAllComponents(NvSelect).find(s => s.props('ariaLabel') === 'Archive retention')!

    expect(select.props('options')).toHaveLength(4)
    expect(select.props('modelValue')).toBe(String(store.settings.files.trashRetentionDays))

    select.vm.$emit('update:modelValue', '90')
    await wrapper.vm.$nextTick()
    expect(store.settings.files.trashRetentionDays).toBe(90)

    wrapper.unmount()
  })
})
