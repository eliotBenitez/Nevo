import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import SettingsPluginsPanel from './SettingsPluginsPanel.vue'
import en from '../../../locales/en.json'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { PluginManifest } from '../../../types/workspace'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
}))

vi.mock('../../../tauri/commands', () => ({
  workspaceCommands: {
    validatePluginManifest: vi.fn(),
  },
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function plugin(id: string, enabled: boolean): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: 'Plugin',
    enabled,
    entryPoint: 'index.js',
    apiVersion: '1.0.0',
    editorCapabilities: ['editor.read'],
  }
}

describe('SettingsPluginsPanel', () => {
  it('includes system plugins in total and enabled filter counts', () => {
    setActivePinia(createPinia())
    const workspaceStore = useWorkspaceStore()
    const settings = createDefaultWorkspaceSettings()
    settings.features.vega = false
    workspaceStore.settings = settings
    workspaceStore.plugins = [
      plugin('plugin.enabled', true),
      plugin('plugin.disabled', false),
    ]

    const wrapper = mount(SettingsPluginsPanel, {
      global: {
        plugins: [i18n],
      },
    })

    const filterText = wrapper.find('.filters').text()
    expect(filterText).toContain('All · 6')
    expect(filterText).toContain('Enabled · 4')
  })
})
