import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import en from '../../../locales/en.json'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { WorkspaceSettings } from '../../../types/workspace'
import { useAiModels } from '../../../composables/useAiModels'
import AiChatModelPicker from './AiChatModelPicker.vue'

const listModels = vi.fn()

vi.mock('../../../tauri/ai', () => ({ aiCommands: { listModels: (...a: unknown[]) => listModels(...a) } }))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function setup() {
  const store = useWorkspaceStore()
  store.settings = {
    ...store.settings,
    ai: { ...store.settings.ai, enabled: true, apiKind: 'openai', baseUrl: 'https://openrouter.ai/api/v1', defaultModel: 'b/model:free' },
  }
  store.updateSettings = vi.fn(async (mutator: (d: WorkspaceSettings) => void) => {
    const draft = structuredClone(store.settings)
    mutator(draft)
    store.settings = draft
  })
  const wrapper = mount(AiChatModelPicker, {
    props: { model: 'b/model:free', local: false, host: 'openrouter.ai' },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  return { store, wrapper }
}

const menuItems = () => Array.from(document.body.querySelectorAll<HTMLButtonElement>('.nv-popup-menu__panel .nv-menu-item'))

describe('AiChatModelPicker', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAiModels().reset()
    document.body.innerHTML = ''
    listModels.mockReset().mockResolvedValue(['a/model:free', 'b/model:free', 'paid/model'])
  })

  it('loads models when opened and switches the default model', async () => {
    const { store, wrapper } = setup()
    expect(listModels).not.toHaveBeenCalled()

    await wrapper.find('.ai-model').trigger('click')
    await flushPromises()

    expect(listModels).toHaveBeenCalledWith('https://openrouter.ai/api/v1', 'openai', expect.any(Boolean))
    const labels = menuItems().map(b => b.textContent?.trim())
    expect(labels).toEqual(['a/model:free', 'b/model:free', en.aiChat.error.openSettings])

    menuItems()[0].click()
    await flushPromises()
    expect(store.settings.ai.defaultModel).toBe('a/model:free')
    wrapper.unmount()
  })

  it('keeps a route to settings when the listing fails', async () => {
    listModels.mockRejectedValue(new Error('HTTP status client error (401 Unauthorized)'))
    const { wrapper } = setup()
    await wrapper.find('.ai-model').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain(en.aiChat.composer.modelsError)
    menuItems().at(-1)!.click()
    expect(wrapper.emitted('open-settings')).toHaveLength(1)
    wrapper.unmount()
  })
})
