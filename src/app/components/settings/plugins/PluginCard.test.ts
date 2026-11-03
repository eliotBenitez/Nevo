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
    props: { plugin: desktopOnlyPlugin(), isValid: true, isExpanded: false, isLoading: false },
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
})
