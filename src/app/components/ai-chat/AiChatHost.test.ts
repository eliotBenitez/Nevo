import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { nextTick } from 'vue'
import en from '../../../locales/en.json'
import { useAiChatStore } from '../../../stores/aiChat'
import { useWorkspaceStore } from '../../../stores/workspace'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'

vi.mock('../../composables/aiChat/useAiChatSession', () => ({ useAiChatSession: () => ({ send: vi.fn(), stop: vi.fn(), retry: vi.fn() }) }))
vi.mock('../../composables/aiChat/useAiChatActions', () => ({ useAiChatActions: () => ({ openSource: vi.fn() }) }))

import AiChatHost from './AiChatHost.vue'

function setup(aiEnabled = true, props: Record<string, unknown> = {}) {
  setActivePinia(createPinia())
  const workspace = useWorkspaceStore()
  const defaults = createDefaultWorkspaceSettings()
  workspace.settings = { ...defaults, ai: { ...defaults.ai, enabled: aiEnabled } }
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  const outside = document.createElement('button')
  document.body.append(outside)
  const wrapper = mount(AiChatHost, {
    attachTo: document.body,
    props: { activeNoteId: null, rightPanelVisible: false, bottomNavVisible: false, suppressed: false, ...props },
    global: { plugins: [i18n], stubs: { teleport: true } },
  })
  return { wrapper, store: useAiChatStore(), outside }
}

describe('AiChatHost', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('renders nothing when AI is disabled', () => {
    const { wrapper } = setup(false)
    expect(wrapper.find('.ai-fab').exists()).toBe(false)
    expect(wrapper.find('.ai-chat-float').exists()).toBe(false)
  })

  it('renders nothing on suppressed views', () => {
    const { wrapper } = setup(true, { suppressed: true })
    expect(wrapper.find('.ai-fab').exists()).toBe(false)
  })

  it('exposes the launcher with aria state and the bound shortcut', () => {
    const { wrapper } = setup()
    const fab = wrapper.find('.ai-fab')
    expect(fab.attributes('aria-expanded')).toBe('false')
    expect(fab.attributes('aria-keyshortcuts')).toBe('Control+J')
    expect(fab.find('kbd').text()).toBe('Ctrl J')
    expect(wrapper.find('.ai-chat-float').attributes('inert')).toBeDefined()
  })

  it('reflects busy, unread and offline states on the launcher', async () => {
    const { wrapper, store } = setup()
    store.streaming = true
    await nextTick()
    expect(wrapper.find('.ai-fab').classes()).toContain('ai-fab--busy')
    store.streaming = false
    store.unread = true
    await nextTick()
    expect(wrapper.find('.ai-fab').classes()).toContain('ai-fab--unread')
    store.messages.push({ id: 'a', role: 'assistant', text: '', status: 'error', errorKind: 'privacy', sources: [] })
    await nextTick()
    expect(wrapper.find('.ai-fab').classes()).toContain('ai-fab--warning')
  })

  it('opens from the launcher and Esc closes it, restoring the previous focus', async () => {
    const { wrapper, store, outside } = setup()
    outside.focus()
    store.setOpen(true)
    await nextTick()
    await nextTick()
    expect(wrapper.find('.ai-chat-float').attributes('inert')).toBeUndefined()
    expect(wrapper.find('.ai-fab').attributes('aria-expanded')).toBe('true')
    expect(document.activeElement).toBe(wrapper.find('textarea').element)
    await wrapper.find('textarea').trigger('keydown', { key: 'Escape' })
    await nextTick()
    await nextTick()
    expect(store.open).toBe(false)
    expect(document.activeElement).toBe(outside)
  })

  it('falls back to the launcher when nothing was focused', async () => {
    const { wrapper, store } = setup()
    store.setOpen(true)
    await nextTick()
    await nextTick()
    await wrapper.find('textarea').trigger('keydown', { key: 'Escape' })
    await nextTick()
    await nextTick()
    expect(document.activeElement).toBe(wrapper.find('.ai-fab').element)
  })

  it('hides the launcher while docked and open and shows the dock shell', async () => {
    const { wrapper, store } = setup()
    store.setDocked(true)
    store.setOpen(true)
    await nextTick()
    expect(wrapper.find('.ai-fab').exists()).toBe(false)
    expect(wrapper.find('.workspace-ai-dock-shell').classes()).not.toContain('workspace-ai-dock-shell--hidden')
    store.setOpen(false)
    await nextTick()
    expect(wrapper.find('.ai-fab').exists()).toBe(true)
    expect(wrapper.find('.workspace-ai-dock-shell').classes()).toContain('workspace-ai-dock-shell--hidden')
  })
})
