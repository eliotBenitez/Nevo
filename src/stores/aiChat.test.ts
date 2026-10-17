import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, ref } from 'vue'

const activePath = ref<string | null>('/ws/a')
vi.mock('./workspace', () => ({
  useWorkspaceStore: () => ({ get activePath() { return activePath.value } }),
}))

import { useAiChatStore } from './aiChat'

describe('aiChat store', () => {
  beforeEach(() => {
    activePath.value = '/ws/a'
    setActivePinia(createPinia())
  })

  it('opening clears unread; toggle flips open', () => {
    const store = useAiChatStore()
    store.unread = true
    store.toggle()
    expect(store.open).toBe(true)
    expect(store.unread).toBe(false)
    store.toggle()
    expect(store.open).toBe(false)
  })

  it('newChat clears messages and invalidates running streams', () => {
    const store = useAiChatStore()
    store.messages.push({ id: store.nextMessageId(), role: 'user', text: 'hi' })
    store.streaming = true
    const gen = store.generation
    store.newChat()
    expect(store.messages).toEqual([])
    expect(store.streaming).toBe(false)
    expect(store.generation).toBe(gen + 1)
  })

  it('resets when the active workspace changes', async () => {
    const store = useAiChatStore()
    store.setOpen(true)
    store.messages.push({ id: store.nextMessageId(), role: 'user', text: 'hi' })
    activePath.value = '/ws/b'
    await nextTick()
    expect(store.messages).toEqual([])
    expect(store.open).toBe(false)
  })

  it('has the documented defaults', () => {
    const store = useAiChatStore()
    expect(store.scope).toBe('workspace')
    expect(store.includeCurrentNote).toBe(true)
    expect(store.docked).toBe(false)
  })
})
