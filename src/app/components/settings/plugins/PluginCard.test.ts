import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import PluginCard from './PluginCard.vue'
import en from '../../../../locales/en.json'
import { useWorkspaceStore } from '../../../../stores/workspace'
import type { AppMetadata, PluginManifest } from '../../../../types/workspace'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

const UNAVAILABLE_TEXT = en.settings.plugins.unavailableOnDevice

function desktopOnlyPlugin(): PluginManifest {
  return {
    id: 'plugin.desktop',
    name: 'Desktop plugin',
    version: '1.0.0',
    description: 'Plugin',
    enabled: true,
    kind: 'user',
    source: 'folder',
    entryPoint: 'index.js',
    apiVersion: '2.0.0',
    executionMode: 'sandboxed-worker',
    capabilities: ['editor.write'],
    editorCapabilities: [],
    uiCapabilities: [],
    workspaceCapabilities: [],
    runtimes: ['desktop'],
  }
}

function mountCard(runtime: AppMetadata['runtime']) {
  setActivePinia(createPinia())
  const workspaceStore = useWorkspaceStore()
  workspaceStore.appMetadata = { runtime } as AppMetadata
  return mount(PluginCard, {
    props: { plugin: desktopOnlyPlugin(), isValid: true, isLoading: false },
    global: { plugins: [i18n] },
  })
}

describe('PluginCard', () => {
  it('marks a plugin unavailable on a runtime it does not list', () => {
    const wrapper = mountCard('android')
    expect(wrapper.text()).toContain(UNAVAILABLE_TEXT)
  })

  it('does not mark a plugin unavailable on a listed runtime', () => {
    const wrapper = mountCard('desktop')
    expect(wrapper.text()).not.toContain(UNAVAILABLE_TEXT)
  })

  it('emits open from the title button', async () => {
    const wrapper = mountCard('desktop')
    await wrapper.find('.plugin-title-button').trigger('click')
    expect(wrapper.emitted('open')).toHaveLength(1)
  })

  it('emits openSettings from the configure button', async () => {
    setActivePinia(createPinia())
    const plugin = { ...desktopOnlyPlugin(), settingsSchema: [{ key: 'k' }] } as unknown as PluginManifest
    const wrapper = mount(PluginCard, {
      props: { plugin, isValid: true, isLoading: false },
      global: { plugins: [i18n] },
    })
    const configure = wrapper.findAll('button').find(b => b.text() === en.settings.plugins.settings.configure)
    await configure!.trigger('click')
    expect(wrapper.emitted('openSettings')).toHaveLength(1)
  })

  it('shows manifest.name and manifest.description from plugin messages', () => {
    setActivePinia(createPinia())
    const wrapper = mount(PluginCard, {
      props: {
        plugin: desktopOnlyPlugin(),
        isValid: true,
        isLoading: false,
        messages: { 'manifest.name': 'Локальное имя', 'manifest.description': 'Локальное описание' },
      },
      global: { plugins: [i18n] },
    })
    expect(wrapper.text()).toContain('Локальное имя')
    expect(wrapper.text()).toContain('Локальное описание')
    expect(wrapper.text()).not.toContain('Desktop plugin')
  })
})
