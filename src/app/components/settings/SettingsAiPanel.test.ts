import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import SettingsAiPanel from './SettingsAiPanel.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import en from '../../../locales/en.json'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { WorkspaceSettings } from '../../../types/workspace'

const listModels = vi.fn()

vi.mock('../../../tauri/ai', () => ({
  aiCommands: { listModels: (...a: unknown[]) => listModels(...a) },
}))
vi.mock('../../../tauri/secureStore', () => ({
  SECRET_AI_API_KEY: 'nevo:ai.apiKey',
  secureStore: { get: vi.fn().mockResolvedValue('sk-or'), set: vi.fn(), delete: vi.fn() },
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function setup(ai: Partial<WorkspaceSettings['ai']> = {}) {
  const store = useWorkspaceStore()
  store.settings = { ...store.settings, ai: { ...store.settings.ai, enabled: true, ...ai } }
  store.updateSettings = vi.fn(async (mutator: (d: WorkspaceSettings) => void) => {
    const draft = structuredClone(store.settings)
    mutator(draft)
    store.settings = draft
  })
  const wrapper = mount(SettingsAiPanel, { global: { plugins: [i18n] } })
  return { store, wrapper }
}

const selects = (w: ReturnType<typeof setup>['wrapper']) => w.findAllComponents(NvSelect)

describe('SettingsAiPanel OpenRouter preset', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    listModels.mockReset().mockResolvedValue([
      'openai/gpt-4o',
      'meta-llama/llama-3.3-70b-instruct:free',
      'deepseek/deepseek-r1:free',
    ])
  })

  it('points the OpenAI-compatible kind at OpenRouter and offers only free models', async () => {
    const { store, wrapper } = setup({ apiKind: 'ollama', baseUrl: 'http://localhost:11434', defaultModel: 'llama3' })
    await flushPromises()
    expect(listModels).not.toHaveBeenCalled()

    selects(wrapper)[0].vm.$emit('update:modelValue', 'openrouter')
    await flushPromises()

    expect(store.settings.ai.apiKind).toBe('openai')
    expect(store.settings.ai.baseUrl).toBe('https://openrouter.ai/api/v1')
    expect(listModels).toHaveBeenCalledWith('https://openrouter.ai/api/v1', 'openai', 'sk-or')
    const modelOptions = selects(wrapper)[1].props('options') as readonly { value: string }[]
    expect(modelOptions.map(o => o.value)).toEqual(['deepseek/deepseek-r1:free', 'meta-llama/llama-3.3-70b-instruct:free'])
    expect(store.settings.ai.defaultModel).toBe('deepseek/deepseek-r1:free')
    expect(selects(wrapper)[0].props('modelValue')).toBe('openrouter')
  })

  it('loads free models on open and warns while privacy mode blocks cloud models', async () => {
    const { store, wrapper } = setup({
      apiKind: 'openai',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
      privacyMode: true,
    })
    await flushPromises()
    expect(listModels).toHaveBeenCalledTimes(1)
    expect(store.settings.ai.defaultModel).toBe('meta-llama/llama-3.3-70b-instruct:free')
    expect(wrapper.find('.openrouter-privacy').exists()).toBe(true)
  })

  it('restores the local default when leaving the preset', async () => {
    const { store, wrapper } = setup({ apiKind: 'openai', baseUrl: 'https://openrouter.ai/api/v1' })
    await flushPromises()
    selects(wrapper)[0].vm.$emit('update:modelValue', 'ollama')
    await flushPromises()
    expect(store.settings.ai.apiKind).toBe('ollama')
    expect(store.settings.ai.baseUrl).toBe('http://localhost:11434')
  })
})
