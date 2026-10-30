import { computed, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useThemeStore } from '../../../stores/theme'
import { useWorkspaceStore } from '../../../stores/workspace'
import { ACCENT_PRESETS } from '../../../utils/workspace-settings'

export interface UseWorkspaceAppearanceOptions {
  shellStyle: Readonly<Ref<Record<string, string>>>
  useDrawerNavigation: Readonly<Ref<boolean>>
  useFullscreenDialogs: Readonly<Ref<boolean>>
  isPhone: Readonly<Ref<boolean>>
  showMobileBottomNav: Readonly<Ref<boolean>>
}

// Root element styling derived from settings: accent colours, density, motion and layout mode classes.
export function useWorkspaceAppearance(options: UseWorkspaceAppearanceOptions) {
  const { shellStyle, useDrawerNavigation, useFullscreenDialogs, isPhone, showMobileBottomNav } = options
  const themeStore = useThemeStore()
  const { settings, appConfig } = storeToRefs(useWorkspaceStore())

  // Dark-mode detection for the draw canvas background. The theme store applies
  // a `theme-dark` class to <html>; we mirror it reactively.
  const isDarkMode = computed(() => {
    void themeStore.theme
    return typeof document !== 'undefined' && document.documentElement.classList.contains('theme-dark')
  })

  const workspaceRootStyle = computed(() => {
    const val = settings.value.appearance.accentPreset
    const accent = ACCENT_PRESETS[val]
    if (accent) {
      return {
        '--accent': accent.accent,
        '--accent-soft': accent.soft,
        '--selection': `color-mix(in oklab, ${accent.accent} 25%, transparent)`,
        ...shellStyle.value,
      }
    }
    return {
      '--accent': val,
      '--accent-soft': `color-mix(in oklab, ${val} 14%, transparent)`,
      '--selection': `color-mix(in oklab, ${val} 25%, transparent)`,
      ...shellStyle.value,
    }
  })
  const workspaceRootClasses = computed(() => ({
    'workspace-root--compact': appConfig.value.interfaceDensity === 'compact',
    'workspace-root--drawer': useDrawerNavigation.value,
    'workspace-root--phone': isPhone.value,
    'workspace-root--mobile-primary': showMobileBottomNav.value,
    'workspace-root--fullscreen-dialogs': useFullscreenDialogs.value,
    'workspace-root--reduced-motion': appConfig.value.reducedMotion === 'reduce',
  }))

  return { isDarkMode, workspaceRootStyle, workspaceRootClasses }
}
