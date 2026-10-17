import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import en from '../../../locales/en.json'
import { useAiChatStore } from '../../../stores/aiChat'
import { useWorkspaceStore } from '../../../stores/workspace'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'

const session = { send: vi.fn(), stop: vi.fn(), retry: vi.fn() }
vi.mock('../../composables/aiChat/useAiChatSession', () => ({ useAiChatSession: () => session }))

import AiChatPanel from './AiChatPanel.vue'

const actions = {
  insert: vi.fn(),
  replace: vi.fn(),
  copy: vi.fn(async () => {}),
  createNote: vi.fn(async () => 'n2'),
  openSource: vi.fn(),
}

const SOURCE = { n: 1, noteId: 'a', noteTitle: 'Field diary', blockIndex: 3, text: 'water level' }

function mountPanel(noteId: string | null = null) {
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  return mount(AiChatPanel, {
    props: { variant: 'floating', actions: actions as never, noteId },
    global: { plugins: [i18n] },
  })
}

function seedAnswer(selection?: { noteId: string; from: number; to: number; text: string }) {
  const store = useAiChatStore()
  store.messages.push({ id: 'u1', role: 'user', text: 'Compare' })
  store.messages.push({ id: 'a1', role: 'assistant', text: 'Level is higher [1].', status: 'done', sources: [SOURCE], selection })
  return store
}

describe('AiChatPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const workspace = useWorkspaceStore()
    workspace.settings = { ...createDefaultWorkspaceSettings(), ai: { ...createDefaultWorkspaceSettings().ai, enabled: true, defaultModel: 'qwen3:8b' } }
    Object.values(session).forEach(fn => fn.mockReset())
    actions.replace.mockReset()
    actions.openSource.mockReset()
  })

  it('shows the empty state and sends a clicked suggestion', async () => {
    const wrapper = mountPanel(null)
    const items = wrapper.findAll('.ai-suggest__item')
    expect(items).toHaveLength(3)
    await items[0].trigger('click')
    expect(session.send).toHaveBeenCalledWith(items[0].text())
  })

  it('uses the note-aware suggestion set when a note is open', () => {
    const wrapper = mountPanel('a')
    expect(wrapper.find('.ai-suggest__label').text()).toBe('For this note')
    expect(wrapper.text()).toContain('Summarize this note')
  })

  it('sends the composer text on Enter and keeps Shift+Enter as a newline', async () => {
    const wrapper = mountPanel()
    const input = wrapper.find('textarea')
    await input.setValue('hello')
    await input.trigger('keydown', { key: 'Enter', shiftKey: true })
    expect(session.send).not.toHaveBeenCalled()
    await input.trigger('keydown', { key: 'Enter' })
    expect(session.send).toHaveBeenCalledWith('hello')
  })

  it('ignores Enter while an IME composition is active', async () => {
    const wrapper = mountPanel()
    const input = wrapper.find('textarea')
    await input.setValue('hello')
    await input.trigger('keydown', { key: 'Enter', isComposing: true })
    expect(session.send).not.toHaveBeenCalled()
  })

  it('turns the send button into Stop while streaming', async () => {
    const store = useAiChatStore()
    store.messages.push({ id: 'u1', role: 'user', text: 'q' }, { id: 'a1', role: 'assistant', text: 'par', status: 'streaming', sources: [] })
    store.streaming = true
    const wrapper = mountPanel()
    const stop = wrapper.find('button.ai-send')
    expect(stop.attributes('aria-label')).toBe('Stop')
    await stop.trigger('click')
    expect(session.stop).toHaveBeenCalled()
  })

  it('disables Replace without a captured selection', () => {
    seedAnswer()
    const wrapper = mountPanel()
    const replace = wrapper.findAll('button').find(b => b.text() === 'Replace selection')!
    expect(replace.attributes('disabled')).toBeDefined()
  })

  it('previews the replacement and applies it with Ctrl+Enter', async () => {
    const selection = { noteId: 'a', from: 1, to: 6, text: 'old text' }
    seedAnswer(selection)
    const wrapper = mountPanel()
    await wrapper.findAll('button').find(b => b.text() === 'Replace selection')!.trigger('click')
    expect(wrapper.find('.ai-diff del').text()).toBe('old text')
    expect(wrapper.find('.ai-diff ins').text()).toBe('Level is higher.')
    expect(actions.replace).not.toHaveBeenCalled()
    await wrapper.find('.ai-diff-block').trigger('keydown', { key: 'Enter', ctrlKey: true })
    expect(actions.replace).toHaveBeenCalledWith(selection, 'Level is higher [1].')
    expect(wrapper.find('.ai-diff-block').exists()).toBe(false)
  })

  it('opens the cited source from the pill and from the sources list', async () => {
    seedAnswer()
    const wrapper = mountPanel()
    await wrapper.find('.ai-cite').trigger('click')
    expect(actions.openSource).toHaveBeenCalledWith(SOURCE)
    await wrapper.find('.ai-src').trigger('click')
    expect(actions.openSource).toHaveBeenCalledTimes(2)
  })

  it('renders model output as text, never as HTML', () => {
    const store = useAiChatStore()
    store.messages.push({ id: 'a1', role: 'assistant', text: '<img src=x onerror=alert(1)>', status: 'done', sources: [] })
    const wrapper = mountPanel()
    expect(wrapper.find('.ai-msg-ai img').exists()).toBe(false)
    expect(wrapper.find('.ai-msg-ai').text()).toContain('<img')
  })

  it('shows the offline card naming the endpoint host and retries', async () => {
    const store = useAiChatStore()
    store.messages.push({ id: 'u1', role: 'user', text: 'q' }, { id: 'a1', role: 'assistant', text: '', status: 'error', errorKind: 'offline', errorMessage: 'connection refused', sources: [] })
    const wrapper = mountPanel()
    expect(wrapper.text()).toContain('Model not responding')
    expect(wrapper.text()).toContain('localhost')
    await wrapper.findAll('button').find(b => b.text() === 'Retry')!.trigger('click')
    expect(session.retry).toHaveBeenCalledWith('a1')
  })

  it('shows the model chip with its local marker', () => {
    const wrapper = mountPanel()
    expect(wrapper.find('.ai-model').text()).toContain('qwen3:8b')
    expect(wrapper.find('.ai-model__where').text()).toBe('local')
  })

  it('starts a new chat from the header', async () => {
    const store = seedAnswer()
    const wrapper = mountPanel()
    await wrapper.find('button[aria-label="New chat"]').trigger('click')
    expect(store.messages).toHaveLength(0)
  })
})
