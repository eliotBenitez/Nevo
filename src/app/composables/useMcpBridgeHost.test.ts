import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { createPinia, setActivePinia } from 'pinia'
import { useWorkspaceStore } from '../../stores/workspace'
import { useMcpBridgeHost } from './useMcpBridgeHost'

const eventMocks = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  unlisten: vi.fn(),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (
    event: string,
    handler: (event: { payload: unknown }) => void,
  ) => {
    eventMocks.listeners.set(event, handler)
    return eventMocks.unlisten
  }),
}))

vi.mock('../../tauri/mcp', () => ({
  respondToMcpRequest: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../utils/logger', () => ({
  appLogger: {
    error: vi.fn().mockResolvedValue(undefined),
    warn: vi.fn().mockResolvedValue(undefined),
  },
}))

const Host = defineComponent({
  setup() {
    useMcpBridgeHost()
    return () => h('div')
  },
})

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: {} },
})

describe('useMcpBridgeHost', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    eventMocks.listeners.clear()
    eventMocks.unlisten.mockClear()
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      configurable: true,
      value: {},
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  })

  it('refreshes the live manifest after a structural MCP mutation', async () => {
    const workspaceStore = useWorkspaceStore()
    workspaceStore.activeHandle = { kind: 'local', path: '/tmp/workspace' }
    const refreshManifest = vi.spyOn(workspaceStore, 'refreshManifest').mockResolvedValue(undefined)
    const wrapper = mount(Host, { global: { plugins: [i18n] } })
    await flushPromises()

    const listener = eventMocks.listeners.get('mcp-workspace-changed')
    expect(listener).toBeDefined()
    listener?.({ payload: { method: 'notes.create', workspacePath: '/tmp/previous-workspace' } })
    await flushPromises()
    expect(refreshManifest).not.toHaveBeenCalled()

    listener?.({ payload: { method: 'notes.create', workspacePath: '/tmp/workspace' } })
    await flushPromises()

    expect(refreshManifest).toHaveBeenCalledOnce()

    wrapper.unmount()
    expect(eventMocks.unlisten).toHaveBeenCalledTimes(2)
  })
})
