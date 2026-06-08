import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  AppConfig,
  FocusRingStyle,
  InterfaceDensity,
  ReducedMotionMode,
  ScrollbarVisibility,
  ThemeMode,
  WindowChromeStyle,
} from '../types/workspace'
import { useWorkspaceStore } from './workspace'

type Theme = ThemeMode

function applyRootAttr(key: string, value: string) {
  document.documentElement.setAttribute(`data-${key}`, value)
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>('system')
  let mediaQuery: MediaQueryList | null = null
  let onSystemThemeChange: (() => void) | null = null

  function applyTheme(t: Theme) {
    const resolved = t === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : t
    document.documentElement.classList.remove('theme-dark', 'theme-light')
    document.documentElement.classList.add(`theme-${resolved}`)
  }

  function applyAppearance(config: AppConfig) {
    applyTheme(config.theme ?? theme.value)
    applyRootAttr('density', config.interfaceDensity ?? 'comfortable')
    applyRootAttr('motion', config.reducedMotion ?? 'system')
    applyRootAttr('scrollbars', config.scrollbarVisibility ?? 'hidden')
    applyRootAttr('focus-ring', config.focusRingStyle ?? 'accent')
    applyRootAttr('chrome', config.windowChromeStyle ?? 'default')
  }

  async function setTheme(t: Theme) {
    theme.value = t
    applyTheme(t)
    await useWorkspaceStore().setAppTheme(t)
  }

  async function setDensity(value: InterfaceDensity) {
    applyRootAttr('density', value)
    await useWorkspaceStore().saveAppConfig({ interfaceDensity: value })
  }

  async function setReducedMotion(value: ReducedMotionMode) {
    applyRootAttr('motion', value)
    await useWorkspaceStore().saveAppConfig({ reducedMotion: value })
  }

  async function setScrollbarVisibility(value: ScrollbarVisibility) {
    applyRootAttr('scrollbars', value)
    await useWorkspaceStore().saveAppConfig({ scrollbarVisibility: value })
  }

  async function setFocusRingStyle(value: FocusRingStyle) {
    applyRootAttr('focus-ring', value)
    await useWorkspaceStore().saveAppConfig({ focusRingStyle: value })
  }

  async function setWindowChromeStyle(value: WindowChromeStyle) {
    applyRootAttr('chrome', value)
    await useWorkspaceStore().saveAppConfig({ windowChromeStyle: value })
  }

  async function init() {
    const workspaceStore = useWorkspaceStore()
    theme.value = workspaceStore.appConfig.theme
    applyAppearance(workspaceStore.appConfig)

    if (mediaQuery && onSystemThemeChange) {
      mediaQuery.removeEventListener('change', onSystemThemeChange)
    }

    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    onSystemThemeChange = () => {
      if (theme.value === 'system') applyTheme('system')
    }
    mediaQuery.addEventListener('change', onSystemThemeChange)
  }

  return {
    theme,
    setTheme,
    setDensity,
    setReducedMotion,
    setScrollbarVisibility,
    setFocusRingStyle,
    setWindowChromeStyle,
    applyAppearance,
    init,
  }
})
