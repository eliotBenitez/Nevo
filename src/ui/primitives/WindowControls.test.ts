import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WindowControls from './WindowControls.vue'
import { useWorkspaceStore } from '../../stores/workspace'

const mockWindow = {
  minimize: vi.fn().mockResolvedValue(undefined),
  toggleMaximize: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => mockWindow,
}))

describe('WindowControls', () => {
  let pinia: ReturnType<typeof createPinia>

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  it('renders window control buttons when supported', async () => {
    const store = useWorkspaceStore()
    store.appMetadata = {
      version: '1.0.0',
      engine: 'tauri',
      supportsWindowControls: true,
      runtime: 'desktop',
      platform: 'linux',
      appDataDir: '/tmp',
      configPath: '/tmp/config.json',
      logsPath: '/tmp/logs',
      supportsGlobalShortcuts: true,
      supportsRevealInFileManager: true,
      supportsWindowDragRegions: true,
    }

    const wrapper = mount(WindowControls, {
      global: { plugins: [pinia] },
    })
    expect(wrapper.find('.win-controls').exists()).toBe(true)

    const buttons = wrapper.findAll('.wc-btn')
    expect(buttons).toHaveLength(3)

    const minBtn = wrapper.get('.wc-btn--min')
    const maxBtn = wrapper.get('.wc-btn--max')
    const closeBtn = wrapper.get('.wc-btn--close')

    await minBtn.trigger('click')
    await flushPromises()
    expect(mockWindow.minimize).toHaveBeenCalledTimes(1)

    await maxBtn.trigger('click')
    await flushPromises()
    expect(mockWindow.toggleMaximize).toHaveBeenCalledTimes(1)

    await closeBtn.trigger('click')
    await flushPromises()
    expect(mockWindow.close).toHaveBeenCalledTimes(1)
  })

  it('does not render when window controls are not supported', () => {
    const store = useWorkspaceStore()
    store.appMetadata = {
      version: '1.0.0',
      engine: 'tauri',
      supportsWindowControls: false,
      runtime: 'android',
      platform: 'android',
      appDataDir: '/tmp',
      configPath: '/tmp/config.json',
      logsPath: '/tmp/logs',
      supportsGlobalShortcuts: false,
      supportsRevealInFileManager: false,
      supportsWindowDragRegions: false,
    }

    const wrapper = mount(WindowControls, {
      global: { plugins: [pinia] },
    })
    expect(wrapper.find('.win-controls').exists()).toBe(false)
  })

  it('defines square dimensions for window control buttons', async () => {
    const store = useWorkspaceStore()
    store.appMetadata = {
      version: '1.0.0',
      engine: 'tauri',
      supportsWindowControls: true,
      runtime: 'desktop',
      platform: 'linux',
      appDataDir: '/tmp',
      configPath: '/tmp/config.json',
      logsPath: '/tmp/logs',
      supportsGlobalShortcuts: true,
      supportsRevealInFileManager: true,
      supportsWindowDragRegions: true,
    }

    const wrapper = mount(WindowControls, {
      global: { plugins: [pinia] },
    })

    for (const button of wrapper.findAll('.wc-btn')) {
      expect(button.classes()).toEqual(
        expect.arrayContaining(['tw:h-[46px]', 'tw:w-[46px]', 'tw:aspect-square']),
      )
    }
  })
})
