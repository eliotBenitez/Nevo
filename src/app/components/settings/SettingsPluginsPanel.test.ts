import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import SettingsPluginsPanel from './SettingsPluginsPanel.vue'
import en from '../../../locales/en.json'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { PluginManifest } from '../../../types/workspace'

vi.mock('../../../tauri/commands', () => ({
  systemCommands: {
    openWorkspaceLocation: vi.fn(),
    openExternalUrl: vi.fn(),
  },
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
    const sandboxedPlugin = plugin('plugin.enabled', true)
    sandboxedPlugin.executionMode = 'sandboxed-worker'
    sandboxedPlugin.apiVersion = '2.0.0'
    workspaceStore.plugins = [
      plugin('nevo.kanban', true, 'system'),
      plugin('nevo.templates', true, 'system'),
      plugin('nevo.vega', false, 'system'),
      plugin('nevo.markmap', true, 'system'),
      sandboxedPlugin,
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
    expect(wrapper.text()).toContain('Sandbox worker')
    expect(wrapper.text()).toContain('Trusted WebView')
  })
})
