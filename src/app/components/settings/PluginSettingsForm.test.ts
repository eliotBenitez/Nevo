import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import PluginSettingsForm from './PluginSettingsForm.vue'
import type { PluginManifest } from '../../../types/workspace'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { 'app.key': 'App translated' } },
})

function plugin(): PluginManifest {
  return {
    id: 'plugin.demo',
    name: 'Demo',
    version: '1.0.0',
    description: '',
    enabled: true,
    kind: 'user',
    entryPoint: 'index.js',
    apiVersion: '2.0.0',
    editorCapabilities: [],
    settingsSchema: [
      {
        key: 'mode',
        type: 'select',
        label: 'Mode',
        description: 'Raw description',
        options: [{ value: 'fast', label: 'Fast' }, { value: 'slow', label: 'Slow' }],
      },
      { key: 'note', type: 'text', label: 'app.key', placeholder: 'Raw placeholder' },
    ],
  } as unknown as PluginManifest
}

function mountForm(messages?: Record<string, string>) {
  setActivePinia(createPinia())
  return mount(PluginSettingsForm, {
    props: { plugin: plugin(), messages },
    global: { plugins: [i18n] },
  })
}

describe('PluginSettingsForm', () => {
  it('prefers plugin catalog text over app keys and raw manifest text', () => {
    const wrapper = mountForm({
      'settings.mode.label': 'Режим',
      'settings.mode.description': 'Описание режима',
      'settings.mode.options.fast': 'Быстро',
      'settings.note.label': 'Заметка',
      'settings.note.placeholder': 'Введите',
    })
    const text = wrapper.text()
    expect(text).toContain('Режим')
    expect(text).toContain('Описание режима')
    expect(text).not.toContain('Raw description')
    expect(text).toContain('Заметка')
    expect(text).not.toContain('App translated')
    expect(wrapper.find('input').attributes('placeholder')).toBe('Введите')
    expect(wrapper.findAll('.row-title').map(node => node.text())).toEqual(['Режим', 'Заметка'])
  })

  it('falls back to app keys and raw manifest text without a catalog', () => {
    const wrapper = mountForm()
    expect(wrapper.text()).toContain('Mode')
    expect(wrapper.text()).toContain('Raw description')
    expect(wrapper.text()).toContain('App translated')
    expect(wrapper.find('input').attributes('placeholder')).toBe('Raw placeholder')
  })
})
