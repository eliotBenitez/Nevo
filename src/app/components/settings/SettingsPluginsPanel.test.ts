import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import SettingsPluginsPanel from './SettingsPluginsPanel.vue'
import en from '../../../locales/en.json'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { PluginManifest } from '../../../types/workspace'

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: vi.fn(),
  openUrl: vi.fn(),
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

function plugin(id: string, enabled: boolean, kind: PluginManifest['kind'] = 'user'): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: 'Plugin',
    enabled,
    kind,
    source: kind === 'system' ? 'bundled' : 'folder',
    entryPoint: 'index.js',
    apiVersion: '1.0.0',
    editorCapabilities: ['editor.read'],
    uiCapabilities: [],
    workspaceCapabilities: [],
  }
}

describe('SettingsPluginsPanel', () => {
  it('counts system and user plugins from the same manifest list', () => {
    setActivePinia(createPinia())
    const workspaceStore = useWorkspaceStore()
    workspaceStore.plugins = [
      plugin('nevo.kanban', true, 'system'),
      plugin('nevo.templates', true, 'system'),
      plugin('nevo.vega', false, 'system'),
      plugin('nevo.markmap', true, 'system'),
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
