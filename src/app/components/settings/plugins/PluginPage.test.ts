import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import PluginPage from './PluginPage.vue'
import en from '../../../../locales/en.json'
import { parseChatMarkdown } from '../../../../core/ai-chat/markdown'
import type { MarketplaceCatalogItem, PluginManifest } from '../../../../types/workspace'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function manifest(extra: Partial<PluginManifest> = {}): PluginManifest {
  return {
    id: 'plugin.demo',
    name: 'Demo',
    version: '1.2.0',
    description: 'A demo',
    enabled: true,
    kind: 'marketplace',
    source: 'marketplace',
    entryPoint: 'index.js',
    apiVersion: '2.0.0',
    executionMode: 'sandboxed-worker',
    capabilities: ['cap.one', 'cap.two', 'cap.three', 'cap.four', 'cap.five', 'cap.six', 'cap.seven'] as unknown as PluginManifest['capabilities'],
    editorCapabilities: [],
    runtimes: ['desktop', 'android'],
    network: { hosts: ['api.example.com'], methods: ['GET', 'POST'] },
    ...extra,
  }
}

function item(status: MarketplaceCatalogItem['status']): MarketplaceCatalogItem {
  return { pluginId: 'plugin.demo', pluginPath: 'plugins/plugin.demo', treeSha: 'abc', status, manifest: manifest(), manifestError: null, installedVersion: null, sourceUrl: 'https://example.com', files: [], permissionFingerprint: 'fp' }
}

function mountPage(props: Record<string, unknown> = {}) {
  return mount(PluginPage, {
    props: {
      manifest: manifest(),
      catalogItem: null,
      installed: manifest(),
      isValid: true,
      isLoading: false,
      isAvailableOnDevice: true,
      canInstall: true,
      canUpdate: true,
      canRemove: true,
      readmeStatus: 'empty',
      readmeBlocks: [],
      ...props,
    },
    global: { plugins: [i18n] },
  })
}

const labels = (w: ReturnType<typeof mountPage>) => w.findAll('button').map(b => b.text())
const click = (w: ReturnType<typeof mountPage>, label: string) => w.findAll('button').find(b => b.text() === label)!.trigger('click')

describe('PluginPage', () => {
  it('renders facts with runtimes and the full permission list', () => {
    const w = mountPage()
    expect(w.find('h3').text()).toBe('Demo')
    expect(w.text()).toContain('1.2.0')
    expect(w.text()).toContain('Desktop')
    expect(w.text()).toContain('Android')
    expect(w.text()).not.toContain('iOS')
    expect(w.findAll('.capability-chip').filter(c => c.text().startsWith('cap.'))).toHaveLength(7)
    expect(w.text()).toContain('api.example.com')
    expect(w.text()).toContain('GET · POST')
  })

  it('shows all devices when runtimes are absent', () => {
    expect(mountPage({ manifest: manifest({ runtimes: undefined }) }).text()).toContain('All devices')
  })

  it('renders the README markdown when ready', () => {
    const w = mountPage({ readmeStatus: 'ready', readmeBlocks: parseChatMarkdown('# Title\n\nHello world') })
    expect(w.find('.plugin-readme').text()).toContain('Hello world')
  })

  it('drops a leading README heading that repeats the plugin name', () => {
    const w = mountPage({ readmeStatus: 'ready', readmeBlocks: parseChatMarkdown('# demo\n\nHello world\n\n## Usage') })
    const readme = w.find('.plugin-readme')
    expect(readme.text()).not.toContain('demo')
    expect(readme.text()).toContain('Usage')
  })

  it('shows the empty state', () => {
    expect(mountPage().text()).toContain(en.settings.plugins.page.readmeEmpty)
  })

  it('shows the error state and emits retryReadme', async () => {
    const w = mountPage({ readmeStatus: 'error' })
    expect(w.text()).toContain(en.settings.plugins.page.readmeError)
    await click(w, en.settings.plugins.page.retry)
    expect(w.emitted('retryReadme')).toHaveLength(1)
  })

  it('offers the installed action set', () => {
    const withSettings = manifest({ settingsSchema: [{ key: 'k' }] as unknown as PluginManifest['settingsSchema'] })
    const l = labels(mountPage({ manifest: withSettings, installed: withSettings }))
    expect(l).toContain('Configure')
    expect(l).toContain('Remove')
    expect(l).not.toContain('Install')
  })

  it('offers install for a catalog-only plugin and emits it', async () => {
    const w = mountPage({ installed: null, catalogItem: item('notInstalled') })
    expect(labels(w)).not.toContain('Remove')
    await click(w, 'Install')
    expect(w.emitted('install')).toHaveLength(1)
  })

  it('emits back', async () => {
    const w = mountPage()
    await click(w, 'All plugins')
    expect(w.emitted('back')).toHaveLength(1)
  })

  it('uses manifest.name and manifest.description from plugin messages', () => {
    const w = mountPage({ messages: { 'manifest.name': 'Демо', 'manifest.description': 'Описание' } })
    expect(w.find('.plugin-page__title').text()).toBe('Демо')
    expect(w.text()).toContain('Описание')
  })
})
