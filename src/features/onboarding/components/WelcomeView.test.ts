import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import WelcomeView from './WelcomeView.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import en from '../../../locales/en.json'

let wrapper: VueWrapper | null = null

function mountWelcome() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const store = useWorkspaceStore()
  wrapper = mount(WelcomeView, {
    global: {
      plugins: [pinia, createI18n({ legacy: false, locale: 'en', messages: { en } })],
    },
  })
  return { wrapper, store }
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

describe('WelcomeView', () => {
  it('labels the language control with the current language instead of the next one', () => {
    const { wrapper, store } = mountWelcome()
    const locale = store.appConfig.locale as keyof typeof en.settings.options.language

    const trigger = wrapper.get('.lang-toggle')
    expect(trigger.attributes('aria-haspopup')).toBe('menu')
    expect(trigger.text()).toBe(`Language: ${en.settings.options.language[locale]}`)
  })

  it('shows a platform-appropriate open shortcut and handles the advertised keys', async () => {
    const { wrapper } = mountWelcome()

    expect(wrapper.text()).toContain('Ctrl+O')
    expect(wrapper.text()).not.toContain('⌘O')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o', code: 'KeyO', ctrlKey: true, cancelable: true }))
    expect(wrapper.emitted('open')).toHaveLength(1)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }))
    expect(wrapper.emitted('create')).toHaveLength(1)
  })

  it('does not hijack Enter while a control is focused', () => {
    const { wrapper } = mountWelcome()
    const openCard = wrapper.findAll('.action-card')[1].element

    openCard.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    expect(wrapper.emitted('create')).toBeUndefined()
  })

  it('lists recent workspaces and opens one directly', async () => {
    const { wrapper, store } = mountWelcome()
    store.recents = [
      { id: 'ws-1', name: 'Field notes', glyph: 'F', gradient: 'var(--accent)', path: '/home/u/field-notes', lastOpened: '2026-09-22T10:00:00Z', pageCount: 128 },
    ]
    const openWorkspace = vi.spyOn(store, 'openWorkspace').mockResolvedValue(undefined as never)
    await wrapper.vm.$nextTick()

    const row = wrapper.get('.recent-row')
    expect(row.text()).toContain('Field notes')
    expect(row.attributes('role')).toBeUndefined()

    await row.trigger('click')
    await flushPromises()
    expect(openWorkspace).toHaveBeenCalledWith('/home/u/field-notes')
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('hides the recent panel when there are no recent workspaces', () => {
    const { wrapper } = mountWelcome()
    expect(wrapper.find('.welcome-right').exists()).toBe(false)
  })
})
