import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import SettingsAiApiKeyRow from './SettingsAiApiKeyRow.vue'
import en from '../../../locales/en.json'

const has = vi.fn()
const save = vi.fn()
const del = vi.fn()

vi.mock('../../../tauri/aiApiKey', () => ({
  hasAiApiKey: (...a: unknown[]) => has(...a),
  saveAiApiKey: (...a: unknown[]) => save(...a),
  deleteAiApiKey: (...a: unknown[]) => del(...a),
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
    has.mockReset().mockResolvedValue(false)
    save.mockReset().mockResolvedValue(undefined)
    del.mockReset().mockResolvedValue(undefined)
  })

  it('saves a trimmed key for the endpoint and clears the masked field', async () => {
    const wrapper = await mountRow()
    const input = wrapper.find('input')
    expect(input.attributes('type')).toBe('password')
    await input.setValue('  sk-secret  ')
    await buttons(wrapper)[0].trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledWith('https://openrouter.ai/api/v1', 'sk-secret')
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain(en.settings.ai.apiKey.saved)
  })

  it('never shows a saved key and can clear it', async () => {
    has.mockResolvedValue(true)
    const wrapper = await mountRow()
    expect(has).toHaveBeenCalledWith('https://openrouter.ai/api/v1')
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('')
    expect(wrapper.text()).toContain(en.settings.ai.apiKey.saved)
    const clear = buttons(wrapper).find(b => b.text() === en.settings.ai.apiKey.clear)!
    await clear.trigger('click')
    await flushPromises()
    expect(del).toHaveBeenCalled()
    expect(wrapper.text()).toContain(en.settings.ai.apiKey.description)
  })

  it('rechecks the key when the endpoint changes and clears an earlier error', async () => {
    has.mockRejectedValueOnce(new Error('no keychain'))
    const wrapper = await mountRow()
    expect(wrapper.text()).toContain(en.settings.ai.apiKey.error)
    has.mockResolvedValue(true)
    await wrapper.setProps({ baseUrl: 'https://api.groq.com/openai/v1' })
    await flushPromises()
    expect(has).toHaveBeenLastCalledWith('https://api.groq.com/openai/v1')
    expect(wrapper.text()).toContain(en.settings.ai.apiKey.saved)
  })
})
