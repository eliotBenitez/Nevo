import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const defaultAppConfig = {
  version: '1',
  theme: 'light' as const,
  locale: 'ru' as const,
  recents: [],
  interfaceDensity: 'comfortable' as const,
  reducedMotion: 'system' as const,
  scrollbarVisibility: 'hidden' as const,
  focusRingStyle: 'accent' as const,
  windowChromeStyle: 'default' as const,
  themeSchedule: { enabled: false, lightTime: '07:00', darkTime: '20:00' },
}

const mockWorkspaceStore = {
  appConfig: { ...defaultAppConfig },
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
    mockWorkspaceStore.appConfig = {
      ...defaultAppConfig,
      themeSchedule: { ...defaultAppConfig.themeSchedule },
    }
    document.documentElement.className = ''
    delete (document as unknown as { startViewTransition?: unknown }).startViewTransition
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
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
    expect(document.documentElement.classList.contains('theme-light')).toBe(false)
  })

  it('swaps the theme class instantly when the View Transitions API is unavailable', async () => {
    const themeStore = useThemeStore()
    await themeStore.init()

    await themeStore.setTheme('dark')

    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
  })

  it('routes the theme swap through startViewTransition when available', async () => {
    const startViewTransition = vi.fn((cb: () => void) => {
      cb()
      return {}
    })
    ;(document as unknown as { startViewTransition: typeof startViewTransition }).startViewTransition =
      startViewTransition

    const themeStore = useThemeStore()
    await themeStore.init()

    await themeStore.setTheme('dark')

    expect(startViewTransition).toHaveBeenCalledTimes(1)
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
  })

  it('does not start a transition when the resolved theme stays the same', async () => {
    const startViewTransition = vi.fn((cb: () => void) => {
      cb()
      return {}
    })
    ;(document as unknown as { startViewTransition: typeof startViewTransition }).startViewTransition =
      startViewTransition

    const themeStore = useThemeStore()
    await themeStore.init()

    await themeStore.setTheme('light')

    expect(document.documentElement.classList.contains('theme-light')).toBe(true)
    expect(startViewTransition).not.toHaveBeenCalled()
  })

  it('changes the resolved theme when a schedule change flips it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 11, 21, 0))
    const themeStore = useThemeStore()
    await themeStore.init()

    await themeStore.setThemeSchedule({ enabled: true, lightTime: '07:00', darkTime: '20:00' })

    expect(document.documentElement.classList.contains('theme-dark')).toBe(true)
  })
})
