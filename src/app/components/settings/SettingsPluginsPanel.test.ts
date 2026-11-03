import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import SettingsPluginsPanel from './SettingsPluginsPanel.vue'
import en from '../../../locales/en.json'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { MarketplaceCatalogItem, PluginManifest } from '../../../types/workspace'
import { pluginReadmeCommands } from '../../../tauri/pluginReadme'
import { clearPluginMessagesCache } from '../../../core/plugins/pluginMessages'

vi.mock('../../../tauri/pluginReadme', () => ({
  pluginReadmeCommands: {
    readLocal: vi.fn(async () => '# Hello\n\nWorld'),
    fetchMarketplace: vi.fn(async () => null),
  },
}))

const messageCommands = vi.hoisted(() => ({
  readLocal: vi.fn(async () => ({ locale: 'ru', messages: { 'manifest.name': 'Демо' } })),
  fetchMarketplace: vi.fn(async () => ({ locale: 'ru', messages: { 'manifest.name': 'Удалённый' } })),
}))
vi.mock('../../../tauri/pluginMessages', () => ({ pluginMessagesCommands: messageCommands }))

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

const i18nRu = createI18n({
  legacy: false,
  locale: 'ru',
  messages: { ru: en },
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

  it('opens a plugin page with its README and returns to the list', async () => {
    setActivePinia(createPinia())
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'local', path: '/ws' }
    workspaceStore.plugins = [plugin('plugin.demo', true)]
    const wrapper = mount(SettingsPluginsPanel, { global: { plugins: [i18n] }, attachTo: document.body })
    await wrapper.find('[data-plugin-open="plugin.demo"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.plugin-readme').text()).toContain('World')
    expect(wrapper.find('.filters').exists()).toBe(false)
    await wrapper.findAll('button').find(b => b.text() === 'All plugins')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.filters').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens plugin settings in a dialog', async () => {
    setActivePinia(createPinia())
    const workspaceStore = useWorkspaceStore()
    const configurable = plugin('plugin.cfg', true)
    configurable.settingsSchema = [{ key: 'token', type: 'text', label: 'Token' }] as unknown as PluginManifest['settingsSchema']
    workspaceStore.plugins = [configurable]
    const wrapper = mount(SettingsPluginsPanel, { global: { plugins: [i18n] }, attachTo: document.body })
    await wrapper.findAll('button').find(b => b.text() === 'Configure')!.trigger('click')
    await flushPromises()
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(dialog!.textContent).toContain('Token')
    wrapper.unmount()
  })

  it('shows installed plugin names and loads the README for the app locale', async () => {
    clearPluginMessagesCache()
    setActivePinia(createPinia())
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'local', path: '/ws' }
    workspaceStore.plugins = [{ ...plugin('plugin.demo', true), defaultLocale: 'de' }]
    const wrapper = mount(SettingsPluginsPanel, { global: { plugins: [i18nRu] }, attachTo: document.body })
    await flushPromises()
    expect(messageCommands.readLocal).toHaveBeenCalledWith('/ws', 'plugin.demo', 'ru', 'de')
    expect(wrapper.find('[data-plugin-open="plugin.demo"]').text()).toContain('Демо')
    await wrapper.find('[data-plugin-open="plugin.demo"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('.plugin-page__title').text()).toBe('Демо')
    expect(pluginReadmeCommands.readLocal).toHaveBeenCalledWith('/ws', 'plugin.demo', 'ru', 'de')
    wrapper.unmount()
  })

  it('picks the localized README and remote messages for a catalog-only plugin', async () => {
    clearPluginMessagesCache()
    setActivePinia(createPinia())
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'local', path: '/ws' }
    workspaceStore.plugins = []
    const manifest = { ...plugin('plugin.remote', true), kind: 'marketplace' as const }
    const item: MarketplaceCatalogItem = {
      pluginId: 'plugin.remote',
      pluginPath: 'plugins/plugin.remote',
      treeSha: 'sha1',
      status: 'notInstalled',
      manifest,
      manifestError: null,
      installedVersion: null,
      sourceUrl: 'https://example.com',
      files: ['README.md', 'README.ru.md', 'locales/ru.json'],
      permissionFingerprint: 'fp',
    }
    workspaceStore.marketplaceCatalog = { repo: 'r', branch: 'main', updatedAt: '', fromCache: false, error: null, plugins: [item] }
    vi.spyOn(workspaceStore, 'loadMarketplacePlugins').mockResolvedValue(workspaceStore.marketplaceCatalog)
    const wrapper = mount(SettingsPluginsPanel, { global: { plugins: [i18nRu] }, attachTo: document.body })
    await flushPromises()
    await wrapper.findAll('[role="tab"]')[1]!.trigger('click')
    await wrapper.find('[data-plugin-open="plugin.remote"]').trigger('click')
    await flushPromises()
    expect(pluginReadmeCommands.fetchMarketplace).toHaveBeenCalledWith('plugin.remote', 'README.ru.md')
    expect(messageCommands.fetchMarketplace).toHaveBeenCalledWith('plugin.remote', 'ru', 'en')
    expect(wrapper.find('.plugin-page__title').text()).toBe('Удалённый')
    wrapper.unmount()
  })
})
