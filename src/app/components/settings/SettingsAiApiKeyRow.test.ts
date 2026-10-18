import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import SettingsAiApiKeyRow from './SettingsAiApiKeyRow.vue'
import en from '../../../locales/en.json'

const get = vi.fn()
const set = vi.fn()
const del = vi.fn()

vi.mock('../../../tauri/secureStore', () => ({
  SECRET_AI_API_KEY: 'nevo:ai.apiKey',
  secureStore: {
    get: (...a: unknown[]) => get(...a),
    set: (...a: unknown[]) => set(...a),
    delete: (...a: unknown[]) => del(...a),
  },
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

async function mountRow() {
  const wrapper = mount(SettingsAiApiKeyRow, { props: { disabled: false, baseUrl: 'https://openrouter.ai/api/v1' }, global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

const buttons = (w: Awaited<ReturnType<typeof mountRow>>) => w.findAll('button')

describe('SettingsAiApiKeyRow', () => {
  beforeEach(() => {
    get.mockReset().mockResolvedValue(null)
    set.mockReset().mockResolvedValue(undefined)
    del.mockReset().mockResolvedValue(undefined)
  })

  it('saves a trimmed key to the secure store and clears the masked field', async () => {
    const wrapper = await mountRow()
    const input = wrapper.find('input')
    expect(input.attributes('type')).toBe('password')
    await input.setValue('  sk-secret  ')
    await buttons(wrapper)[0].trigger('click')
    await flushPromises()
    expect(set).toHaveBeenCalledWith('nevo:ai.apiKey', JSON.stringify({ origin: 'https://openrouter.ai', key: 'sk-secret' }))
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain(en.settings.ai.apiKey.saved)
  })

  it('never shows a saved key and can clear it', async () => {
    get.mockResolvedValue(JSON.stringify({ origin: 'https://openrouter.ai', key: 'sk-stored' }))
    const wrapper = await mountRow()
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.html()).not.toContain('sk-stored')
    const clear = buttons(wrapper).find(b => b.text() === en.settings.ai.apiKey.clear)!
    await clear.trigger('click')
    await flushPromises()
    expect(del).toHaveBeenCalledWith('nevo:ai.apiKey')
    expect(wrapper.text()).toContain(en.settings.ai.apiKey.description)
  })

  it('does not report a key saved for another endpoint as saved', async () => {
    get.mockResolvedValue(JSON.stringify({ origin: 'https://other.example', key: 'sk-stored' }))
    const wrapper = await mountRow()
    expect(wrapper.text()).toContain(en.settings.ai.apiKey.description)
  })

  it('reports a keychain failure', async () => {
    get.mockRejectedValue(new Error('no keychain'))
    const wrapper = await mountRow()
    expect(wrapper.text()).toContain(en.settings.ai.apiKey.error)
  })
})
