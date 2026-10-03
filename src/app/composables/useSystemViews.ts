import { computed, isRef, ref, watch, type Ref } from 'vue'
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router'
import type { SettingsSectionId } from '../../types/workspace'
import {
  ARCHIVE_PATH,
  SETTINGS_ROOT_PATH,
  isArchivePath,
  isSettingsPath,
  isSystemPath,
  parseSettingsSection,
  settingsPath,
} from '../routing/systemRoutes'

export const ALL_SETTINGS_SECTIONS: readonly SettingsSectionId[] = [
  'general',
  'appearance',
  'editor',
  'workspace',
  'ai',
  'plugins',
  'mcp',
  'hotkeys',
  'files',
  'backup',
  'advanced',
  'about',
]

export const PHONE_SETTINGS_SECTIONS: readonly SettingsSectionId[] = [
  'general',
  'appearance',
  'editor',
  'workspace',
  'ai',
  'plugins',
  'files',
  'backup',
  'advanced',
  'about',
]

export interface UseSystemViewsOptions {
  router: Router
  route: RouteLocationNormalizedLoaded | Ref<RouteLocationNormalizedLoaded>
  closeMobileSidebar?: () => void
  isPhone?: Ref<boolean>
}

const pendingRevealTitle = ref<string | null>(null)

export function useSystemViews(options: UseSystemViewsOptions) {
  const { router, route, closeMobileSidebar, isPhone } = options

  const currentRoute = computed(() => {
    if (isRef(route)) return route.value
    if (router?.currentRoute?.value) return router.currentRoute.value
    return route
  })

  const isSettingsView = computed(() => isSettingsPath(currentRoute.value.path))
  const isArchiveView = computed(() => isArchivePath(currentRoute.value.path))

  const allowedSections = computed(() =>
    isPhone?.value ? PHONE_SETTINGS_SECTIONS : ALL_SETTINGS_SECTIONS,
  )

  const settingsSection = computed<SettingsSectionId | null>(() => {
    if (!isSettingsView.value) return null
    const param = currentRoute.value.params.section
    if (!param) {
      return isPhone?.value ? null : 'general'
    }
    const parsed = parseSettingsSection(param, allowedSections.value)
    if (!parsed) {
      return isPhone?.value ? null : 'general'
    }
    return parsed
  })

  watch(
    [isSettingsView, () => currentRoute.value.params.section],
    ([isSettings, sectionParam]) => {
      if (isSettings && sectionParam) {
        const parsed = parseSettingsSection(sectionParam, allowedSections.value)
        if (!parsed) {
          void router.replace(SETTINGS_ROOT_PATH)
        }
      }
    },
    { immediate: true },
  )

  function getBackCandidate(): string | null {
    const historyBack = (router.options.history?.state?.back as string | null | undefined)
      ?? ((typeof window !== 'undefined' && window.history?.state?.back) as string | null | undefined)

    if (
      typeof historyBack === 'string'
      && historyBack.startsWith('/workspace')
      && !isSystemPath(historyBack)
    ) {
      return historyBack
    }
    return null
  }

  async function leaveSystemView() {
    const back = getBackCandidate()
    if (back) {
      router.back()
    } else {
      const fallback = isPhone?.value ? '/workspace/more' : '/workspace'
      await router.push(fallback)
    }
  }

  async function openSettings(section?: SettingsSectionId | null, revealTitle?: string) {
    closeMobileSidebar?.()
    if (revealTitle) {
      pendingRevealTitle.value = revealTitle
    }
    const target = settingsPath(section)
    if (isSettingsView.value || isArchiveView.value) {
      return router.replace(target)
    }
    return router.push(target)
  }

  async function openArchive() {
    closeMobileSidebar?.()
    if (isSettingsView.value) {
      return router.replace(ARCHIVE_PATH)
    }
    if (!isArchiveView.value) {
      return router.push(ARCHIVE_PATH)
    }
  }

  async function toggleSettings(section?: SettingsSectionId | null) {
    if (isSettingsView.value) {
      return leaveSystemView()
    }
    return openSettings(section)
  }

  async function toggleArchive() {
    if (isArchiveView.value) {
      return leaveSystemView()
    }
    return openArchive()
  }

  function setPendingReveal(title: string | null) {
    pendingRevealTitle.value = title
  }

  function consumePendingReveal(): string | null {
    const title = pendingRevealTitle.value
    pendingRevealTitle.value = null
    return title
  }

  return {
    isSettingsView,
    isArchiveView,
    settingsSection,
    openSettings,
    openArchive,
    toggleSettings,
    toggleArchive,
    leaveSystemView,
    setPendingReveal,
    consumePendingReveal,
  }
}
