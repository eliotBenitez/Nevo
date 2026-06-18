import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  AppConfig,
  FocusRingStyle,
  InterfaceDensity,
  InterfaceRoundness,
  ReducedMotionMode,
  ScrollbarVisibility,
  ThemeMode,
  ThemeSchedule,
  WindowChromeStyle,
} from '../types/workspace'
import { useWorkspaceStore } from './workspace'

type Theme = ThemeMode
type ResolvedTheme = 'light' | 'dark'

const THEME_TRANSITION_CLASS = 'theme-transitioning'
const THEME_TRANSITION_DURATION = 420

function applyRootAttr(key: string, value: string) {
  document.documentElement.setAttribute(`data-${key}`, value)
}

/** Effective value: explicit user choice wins, otherwise disabled by default. */
function resolveReduceTransparency(value: boolean | undefined): boolean {
  return value ?? false
}

/** Returns 'light' when the current local time is within [lightTime, darkTime), otherwise 'dark'. */
function resolveScheduledTheme(schedule: ThemeSchedule): ResolvedTheme {
  const now = new Date()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const toMinutes = (t: string) => {
    const [h, m] = t.split(':').map(Number)
    return h * 60 + m
  }
  const light = toMinutes(schedule.lightTime)
  const dark = toMinutes(schedule.darkTime)
  if (light === dark) return 'light'
  if (light < dark) return minutes >= light && minutes < dark ? 'light' : 'dark'
  // light time is after dark time (e.g. light 07:00 wraps past midnight)
  return minutes >= light || minutes < dark ? 'light' : 'dark'
}

export const useThemeStore = defineStore('theme', () => {
  const theme = ref<Theme>('system')
  const schedule = ref<ThemeSchedule>({ enabled: false, lightTime: '07:00', darkTime: '20:00' })
  let mediaQuery: MediaQueryList | null = null
  let onSystemThemeChange: (() => void) | null = null
  let scheduleTimer: ReturnType<typeof setInterval> | null = null
  let transitionTimer: ReturnType<typeof setTimeout> | null = null
  let appliedTheme: ResolvedTheme | null = null

  function resolveTheme(t: Theme): ResolvedTheme {
    return schedule.value.enabled
      ? resolveScheduledTheme(schedule.value)
      : t === 'system'
        ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
        : t
  }

  function startThemeTransition() {
    if (transitionTimer) {
      clearTimeout(transitionTimer)
    }
    document.documentElement.classList.add(THEME_TRANSITION_CLASS)
    transitionTimer = setTimeout(() => {
      document.documentElement.classList.remove(THEME_TRANSITION_CLASS)
      transitionTimer = null
    }, THEME_TRANSITION_DURATION)
  }

  function applyTheme(t: Theme, options: { animate?: boolean } = {}) {
    const resolved = resolveTheme(t)
    if (options.animate !== false && appliedTheme !== null && appliedTheme !== resolved) {
      startThemeTransition()
    }
    document.documentElement.classList.remove('theme-dark', 'theme-light')
    document.documentElement.classList.add(`theme-${resolved}`)
    appliedTheme = resolved
  }

  function stopScheduleTimer() {
    if (scheduleTimer) {
      clearInterval(scheduleTimer)
      scheduleTimer = null
    }
  }

  function startScheduleTimer() {
    stopScheduleTimer()
    if (!schedule.value.enabled) return
    scheduleTimer = setInterval(() => applyTheme(theme.value), 60_000)
  }

  function applyAppearance(config: AppConfig) {
    schedule.value = config.themeSchedule ?? schedule.value
    applyTheme(config.theme ?? theme.value, { animate: false })
    applyRootAttr('density', config.interfaceDensity ?? 'comfortable')
    applyRootAttr('motion', config.reducedMotion ?? 'system')
    applyRootAttr('scrollbars', config.scrollbarVisibility ?? 'hidden')
    applyRootAttr('focus-ring', config.focusRingStyle ?? 'accent')
    applyRootAttr('chrome', config.windowChromeStyle ?? 'default')
    applyRootAttr('roundness', config.interfaceRoundness ?? 'default')
    applyRootAttr('reduce-transparency', String(resolveReduceTransparency(config.reduceTransparency)))
    document.documentElement.style.setProperty('--ui-scale', String((config.interfaceZoom ?? 100) / 100))
    startScheduleTimer()
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

  async function setInterfaceZoom(value: number) {
    document.documentElement.style.setProperty('--ui-scale', String(value / 100))
    await useWorkspaceStore().saveAppConfig({ interfaceZoom: value })
  }

  // `undefined` resets to the platform auto default; an explicit boolean is a
  // manual override (lets Linux users turn glass back on).
  async function setReduceTransparency(value: boolean | undefined) {
    applyRootAttr('reduce-transparency', String(resolveReduceTransparency(value)))
    await useWorkspaceStore().saveAppConfig({ reduceTransparency: value })
  }

  /** Effective reduce-transparency state for binding UI toggles. */
  const reduceTransparencyEnabled = computed(() =>
    resolveReduceTransparency(useWorkspaceStore().appConfig.reduceTransparency),
  )

  async function setInterfaceRoundness(value: InterfaceRoundness) {
    applyRootAttr('roundness', value)
    await useWorkspaceStore().saveAppConfig({ interfaceRoundness: value })
  }

  async function setThemeSchedule(patch: Partial<ThemeSchedule>) {
    schedule.value = { ...schedule.value, ...patch }
    applyTheme(theme.value)
    startScheduleTimer()
    await useWorkspaceStore().saveAppConfig({ themeSchedule: { ...schedule.value } })
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
      if (theme.value === 'system' && !schedule.value.enabled) applyTheme('system')
    }
    mediaQuery.addEventListener('change', onSystemThemeChange)
  }

  return {
    theme,
    schedule,
    setTheme,
    setDensity,
    setReducedMotion,
    setScrollbarVisibility,
    setFocusRingStyle,
    setWindowChromeStyle,
    setInterfaceZoom,
    setReduceTransparency,
    reduceTransparencyEnabled,
    setInterfaceRoundness,
    setThemeSchedule,
    applyAppearance,
    init,
  }
})
