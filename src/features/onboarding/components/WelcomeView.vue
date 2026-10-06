<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import { Check, ChevronRight, Folder, HardDrive, Languages, Plus } from '@lucide/vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { NvMenuItemDef } from '../../../ui/primitives/menu-types'
import NevoMark from './NevoMark.vue'
import PrivacyBadge from './PrivacyBadge.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useOpenRecentWorkspace } from '../composables/useOpenRecentWorkspace'
import { useRecentWorkspaceNoteCounts } from '../composables/useRecentWorkspaceNoteCounts'
import { useDeviceLayout } from '../../../composables/useDeviceLayout'
import { useWindowKeydown } from '../../../composables/useWindowKeydown'
import { formatModShortcut, isModShortcut, usesCommandKey } from '../../../utils/modShortcut'
import type { AppLocale } from '../../../types/workspace'

const emit = defineEmits<{
  create: []
  open: []
  done: []
}>()

const { t } = useI18n()
const { isTouch, isPhone, runtime } = useDeviceLayout()
const workspaceStore = useWorkspaceStore()
const { appConfig, appMetadata, recents } = storeToRefs(workspaceStore)
const { openingId, openRecent } = useOpenRecentWorkspace(() => emit('done'))

const LOCALE_OPTIONS: AppLocale[] = ['ru', 'en', 'fr', 'es', 'de']

const useCommand = computed(() => usesCommandKey(runtime.value.platform))
const openShortcut = computed(() => formatModShortcut('O', useCommand.value))

const currentLocaleLabel = computed(() => t(`settings.options.language.${appConfig.value.locale}`))

const languageItems = computed<NvMenuItemDef[]>(() => LOCALE_OPTIONS.map(locale => ({
  label: t(`settings.options.language.${locale}`),
  icon: locale === appConfig.value.locale ? Check : undefined,
  action: () => { void workspaceStore.setAppLocale(locale) },
})))

// Only the desktop split shows the Recent panel; it collapses below the
// active welcome view on phone instead of being hidden entirely.
const recentWorkspaces = computed(() => recents.value.slice(0, 6))
const { noteCountLabel } = useRecentWorkspaceNoteCounts(recentWorkspaces)

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && !!target.closest('button, a, input, textarea, select, [contenteditable="true"], [role="menu"]')
}

useWindowKeydown((event) => {
  if (event.defaultPrevented) return
  if (isModShortcut(event, 'O', useCommand.value)) {
    event.preventDefault()
    emit('open')
    return
  }
  const plainEnter = event.key === 'Enter'
    && !event.repeat && !event.isComposing
    && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey
  // A focused control handles Enter itself; only an unfocused screen maps it to "create".
  if (plainEnter && !isInteractiveTarget(event.target)) {
    event.preventDefault()
    emit('create')
  }
})
</script>

<template>
  <div class="welcome-root tw:max-[719px]:flex tw:max-[719px]:flex-col tw:max-[719px]:overflow-y-auto tw:max-[719px]:overscroll-contain tw:relative tw:grid tw:min-h-0 tw:flex-1 tw:overflow-hidden tw:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" :class="{ 'welcome-root--solo': !recentWorkspaces.length }">
    <div class="welcome-left tw:max-[719px]:flex-[1_0_auto] tw:max-[719px]:gap-5 tw:max-[719px]:overflow-visible tw:max-[719px]:pt-[calc(32px+max(var(--safe-area-top),0px))] tw:max-[719px]:pr-[calc(22px+max(var(--safe-area-right),0px))] tw:max-[719px]:pb-6 tw:max-[719px]:pl-[calc(22px+max(var(--safe-area-left),0px))] tw:flex tw:flex-col tw:gap-[26px] tw:overflow-y-auto tw:bg-[var(--island-bg)] tw:pt-14 tw:px-14 tw:pb-8">
      <div class="welcome-brand tw:flex tw:items-center tw:gap-2.5">
        <NevoMark :size="28" />
        <span class="welcome-brand-name tw:text-[15px] tw:font-semibold tw:text-content-primary">{{ t('onboarding.welcome.brand') }}</span>
        <span class="welcome-brand-chip tw:ml-1 tw:inline-flex tw:items-center tw:gap-[5px] tw:rounded-full tw:bg-surface-subtle tw:px-[9px] tw:py-[3px] tw:text-[11px] tw:font-medium tw:text-content-secondary">
          <HardDrive :size="12" aria-hidden="true" />
          {{ t('workspace.localWorkspace') }}
        </span>
      </div>

      <div class="hero-text tw:max-[719px]:max-w-none tw:max-w-[46ch] tw:text-left">
        <h1 class="hero-title tw:max-[719px]:text-[clamp(26px,8vw,30px)] tw:font-nv-ui tw:text-[30px] tw:leading-[1.15] tw:font-semibold tw:tracking-[-0.025em] tw:text-content-primary">
          {{ t('onboarding.welcome.title') }}
          <em class="tw:[font-family:var(--font-serif)] tw:text-[1.15em] tw:font-normal tw:italic tw:text-accent">{{ t('onboarding.welcome.brand') }}</em>
        </h1>
        <p class="hero-sub tw:max-[719px]:max-w-[340px] tw:mt-2.5 tw:text-sm tw:leading-[1.55] tw:text-content-secondary">{{ t('onboarding.welcome.subtitle') }}</p>
      </div>

      <div class="onb-act tw:max-[719px]:mt-2 tw:mt-1 tw:flex tw:flex-col tw:gap-1">
        <button type="button" class="action-card tw:max-[719px]:grid-cols-[40px_minmax(0,1fr)_auto] tw:max-[719px]:min-h-14 tw:max-[719px]:rounded-[calc(15px*var(--radius-scale,1))] tw:max-[719px]:p-2.5 tw:max-[719px]:[&_.nv-kbd]:hidden tw:grid tw:cursor-pointer tw:grid-cols-[36px_minmax(0,1fr)_auto_auto] tw:items-center tw:gap-3.5 tw:-mx-2 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-0 tw:bg-[color-mix(in_oklab,var(--island-bg)_92%,var(--text-primary))] tw:px-2 tw:py-3.5 tw:text-left tw:font-[inherit] tw:text-content-primary tw:transition-colors tw:duration-[120ms] tw:hover:bg-[color-mix(in_oklab,var(--island-bg)_86%,var(--text-primary))] tw:focus-visible:outline-2 tw:focus-visible:-outline-offset-2 tw:focus-visible:outline-focus-ring" @click="emit('create')">
          <span class="action-icon action-icon--accent tw:max-[719px]:size-10 tw:grid tw:h-9 tw:w-9 tw:shrink-0 tw:place-items-center tw:rounded-[calc(9px*var(--radius-scale,1))] tw:bg-accent tw:text-content-on-accent">
            <Plus :size="16" />
          </span>
          <span class="action-text tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
            <span class="action-title tw:text-sm tw:font-semibold tw:tracking-[-0.01em] tw:text-content-primary">{{ t('onboarding.welcome.createWorkspace') }}</span>
            <span class="action-sub tw:max-[719px]:hidden tw:truncate tw:text-[12.5px] tw:leading-[1.4] tw:text-content-muted">{{ t('onboarding.welcome.createSub') }}</span>
          </span>
          <span v-if="!isTouch" class="nv-kbd" aria-hidden="true">⏎</span>
          <ChevronRight :size="16" class="action-chevron tw:shrink-0 tw:text-content-muted" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="action-card tw:max-[719px]:grid-cols-[40px_minmax(0,1fr)_auto] tw:max-[719px]:min-h-14 tw:max-[719px]:rounded-[calc(15px*var(--radius-scale,1))] tw:max-[719px]:p-2.5 tw:max-[719px]:[&_.nv-kbd]:hidden tw:grid tw:cursor-pointer tw:grid-cols-[36px_minmax(0,1fr)_auto_auto] tw:items-center tw:gap-3.5 tw:-mx-2 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-2 tw:py-3.5 tw:text-left tw:font-[inherit] tw:text-content-primary tw:transition-colors tw:duration-[120ms] tw:hover:bg-[var(--hover)] tw:focus-visible:outline-2 tw:focus-visible:-outline-offset-2 tw:focus-visible:outline-focus-ring"
          :aria-keyshortcuts="useCommand ? 'Meta+O' : 'Control+O'"
          @click="emit('open')"
        >
          <span class="action-icon tw:grid tw:max-[719px]:size-10 tw:h-9 tw:w-9 tw:shrink-0 tw:place-items-center tw:rounded-[calc(9px*var(--radius-scale,1))] tw:bg-[var(--frame-bg)] tw:text-content-secondary">
            <Folder :size="16" />
          </span>
          <span class="action-text tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
            <span class="action-title tw:text-sm tw:font-semibold tw:tracking-[-0.01em] tw:text-content-primary">{{ t('onboarding.welcome.openExisting') }}</span>
            <span class="action-sub tw:max-[719px]:hidden tw:truncate tw:text-[12.5px] tw:leading-[1.4] tw:text-content-muted">{{ t('onboarding.welcome.openSub') }}</span>
          </span>
          <span v-if="!isTouch" class="nv-kbd" aria-hidden="true">{{ openShortcut }}</span>
          <ChevronRight :size="16" class="action-chevron tw:shrink-0 tw:text-content-muted" aria-hidden="true" />
        </button>
      </div>

      <div class="onb-foot tw:max-[719px]:flex-wrap tw:max-[719px]:gap-2.5 tw:max-[719px]:pb-[calc(12px+max(var(--safe-area-bottom),0px))] tw:mt-auto tw:flex tw:items-center tw:gap-4 tw:pt-2">
        <PrivacyBadge />
        <NvPopupMenu :items="languageItems" placement="bottom-end" width="180px">
          <template #trigger>
            <button type="button" class="lang-toggle tw:max-[719px]:min-h-11 tw:max-[719px]:min-w-11 tw:ml-auto tw:inline-flex tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:px-2.5 tw:py-[5px] tw:font-nv-ui tw:text-xs tw:font-[550] tw:text-content-secondary tw:transition-colors tw:duration-[120ms] tw:hover:text-content-primary tw:hover:bg-[color-mix(in_oklab,var(--surface-subtle)_82%,var(--text-primary))]" aria-haspopup="menu">
              <Languages :size="12" aria-hidden="true" />
              {{ t('onboarding.welcome.language', { language: currentLocaleLabel }) }}
            </button>
          </template>
        </NvPopupMenu>
      </div>
    </div>

    <div v-if="recentWorkspaces.length" class="welcome-right tw:max-[719px]:overflow-visible tw:max-[719px]:bg-transparent tw:max-[719px]:pt-0 tw:max-[719px]:pr-[calc(22px+max(var(--safe-area-right),0px))] tw:max-[719px]:pb-[calc(24px+max(var(--safe-area-bottom),0px))] tw:max-[719px]:pl-[calc(22px+max(var(--safe-area-left),0px))] tw:flex tw:min-h-0 tw:flex-col tw:gap-3.5 tw:overflow-y-auto tw:bg-[var(--frame-bg)] tw:pt-14 tw:px-10 tw:pb-8">
      <div class="welcome-right-eyebrow tw:font-nv-mono tw:text-[10.5px] tw:leading-none tw:font-medium tw:tracking-[0.06em] tw:uppercase tw:text-content-muted">{{ t('onboarding.welcome.recent') }}</div>
      <div class="recent tw:flex tw:flex-col tw:gap-0.5" role="group" :aria-label="t('onboarding.welcome.recent')">
        <button
          v-for="ws in recentWorkspaces"
          :key="ws.id"
          type="button"
          class="recent-row tw:grid tw:cursor-pointer tw:grid-cols-[30px_minmax(0,1fr)_auto] tw:items-center tw:gap-3 tw:-mx-2 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:px-2 tw:py-[11px] tw:text-left tw:font-[inherit] tw:text-[inherit] tw:transition-colors tw:duration-[120ms] tw:hover:bg-[color-mix(in_oklab,var(--frame-bg)_92%,var(--text-primary))] tw:focus-visible:outline-2 tw:focus-visible:-outline-offset-2 tw:focus-visible:outline-focus-ring tw:disabled:cursor-default tw:disabled:opacity-60"
          :disabled="openingId !== null"
          @click="openRecent(ws.id, ws.path)"
        >
          <span class="ws-glyph tw:grid tw:h-[30px] tw:w-[30px] tw:shrink-0 tw:place-items-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:text-white" :style="{ background: ws.gradient }">
            <NvNoteIcon :value="ws.glyph" :size="15" />
          </span>
          <span class="recent-info tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5">
            <span class="recent-name tw:truncate tw:text-[13px] tw:font-medium tw:text-content-primary">{{ ws.name }}</span>
            <span class="recent-path tw:truncate tw:font-nv-mono tw:text-[11px] tw:text-content-muted">{{ isPhone ? t('workspace.mobile.more.onDevice') : ws.path }}</span>
          </span>
          <span v-if="noteCountLabel(ws.path) !== null" class="recent-pages tw:font-nv-mono tw:text-[11px] tw:whitespace-nowrap tw:text-content-muted">{{ noteCountLabel(ws.path) }}</span>
        </button>
      </div>
    </div>

    <div class="version-badge tw:max-[719px]:hidden tw:absolute tw:right-[18px] tw:bottom-[14px] tw:z-2 tw:text-[11px] tw:text-content-muted tw:font-nv-mono">{{ t('version', { version: appMetadata?.version ?? '0.1.9' }) }}</div>
  </div>
</template>
