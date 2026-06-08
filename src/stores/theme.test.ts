import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const mockWorkspaceStore = {
  appConfig: {
    version: '1',
    theme: 'light' as const,
    locale: 'ru' as const,
    recents: [],
    interfaceDensity: 'comfortable' as const,
    reducedMotion: 'system' as const,
    scrollbarVisibility: 'hidden' as const,
    focusRingStyle: 'accent' as const,
    windowChromeStyle: 'default' as const,
  },
  setAppTheme: vi.fn(),
  saveAppConfig: vi.fn(),
}

vi.mock('./workspace', () => ({
  useWorkspaceStore: () => mockWorkspaceStore,
}))

import { useThemeStore } from './theme'

describe('useThemeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    document.documentElement.className = ''
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
  })

  it('initializes from app config instead of localStorage', async () => {
    mockWorkspaceStore.appConfig.theme = 'light'
    const themeStore = useThemeStore()

    await themeStore.init()

    expect(themeStore.theme).toBe('light')
    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
  })

  it('persists theme changes through the workspace store', async () => {
    const themeStore = useThemeStore()
    await themeStore.init()

    await themeStore.setTheme('dark')

    expect(mockWorkspaceStore.setAppTheme).toHaveBeenCalledWith('dark')
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
  })
})
