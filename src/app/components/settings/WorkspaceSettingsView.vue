<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { ArrowLeft } from '@lucide/vue'
// Loaded here so these styles ship only when the settings view is loaded.
import '../../../styles/settings.css'
import '../../../styles/mobile-settings.css'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useDeviceLayout } from '../../../composables/useDeviceLayout'
import { useMobileBackButton } from '../../../composables/useMobileBackButton'
import { useSettingHighlight } from '../../composables/useSettingHighlight'
import { useSettingsHotkeys } from '../../composables/useSettingsHotkeys'
import { useSettingsSections } from '../../composables/useSettingsSections'
import { useSystemViews } from '../../composables/useSystemViews'
import { SETTINGS_ROOT_PATH, settingsPath } from '../../routing/systemRoutes'
import type { SettingsSectionId } from '../../../types/workspace'
import type { WorkspaceSettingSearchItem } from '../../../types/search'
import SettingsNavColumn from './SettingsNavColumn.vue'
import SettingsSearchResults from './SettingsSearchResults.vue'
import MobileSettingsHome from './MobileSettingsHome.vue'

interface Props {
  section?: SettingsSectionId | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  back: []
}>()

const router = useRouter()
const { t } = useI18n()
const { isPhone } = useDeviceLayout()
const workspaceStore = useWorkspaceStore()

const dialogRef = ref<HTMLElement | null>(null)
const { revealSetting } = useSettingHighlight(dialogRef)
const { capturingBindingId } = useSettingsHotkeys()

const {
  sections,
  mobileSectionGroups,
  getPanelComponent,
  settingsSearch,
  searchResults,
} = useSettingsSections({ isPhone })

const systemViews = useSystemViews({
  router,
  route: router.currentRoute,
  isPhone,
})

const activeSection = computed<SettingsSectionId>(() => {
  if (props.section && sections.value.some(s => s.id === props.section)) {
    return props.section
  }
  return 'general'
})

const activePanelComponent = computed(() => getPanelComponent(activeSection.value))

const activeSectionLabel = computed(() =>
  sections.value.find(s => s.id === activeSection.value)?.label ?? t('settings.title'),
)

let isKeyboardNavigation = false

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Tab' || event.key.startsWith('Arrow')) {
    isKeyboardNavigation = true
  }

  if (event.key !== 'Escape') return
  if (document.body.classList.contains('nv-select-open')) return

  if (capturingBindingId.value) {
    event.preventDefault()
    event.stopPropagation()
    capturingBindingId.value = null
    return
  }

  if (settingsSearch.value) {
    event.preventDefault()
    event.stopPropagation()
    settingsSearch.value = ''
    return
  }

  event.preventDefault()
  event.stopPropagation()
  emit('back')
}

function onWindowPointerDown() {
  isKeyboardNavigation = false
}

function activateDesktopSection(sectionId: SettingsSectionId) {
  settingsSearch.value = ''
  if (props.section !== sectionId) {
    void router.replace(settingsPath(sectionId))
  }
}

function activateMobileSection(sectionId: SettingsSectionId) {
  settingsSearch.value = ''
  void router.push(settingsPath(sectionId))
}

function openSearchResult(result: WorkspaceSettingSearchItem) {
  if (isPhone.value) {
    activateMobileSection(result.section)
  } else {
    activateDesktopSection(result.section)
  }
  void nextTick(() => {
    void revealSetting(result.title)
  })
}

function mobileBack() {
  if (settingsSearch.value) {
    settingsSearch.value = ''
    return
  }
  if (props.section) {
    void router.replace(SETTINGS_ROOT_PATH)
    return
  }
  emit('back')
}

useMobileBackButton(
  mobileBack,
  computed(() => isPhone.value),
)

function focusActiveNavOrTopBar() {
  nextTick(() => {
    if (isPhone.value) {
      const backBtn = dialogRef.value?.querySelector<HTMLElement>('.mobile-settings__back')
      backBtn?.focus()
    } else {
      const activeNav = dialogRef.value?.querySelector<HTMLElement>('.settings-nav-item.is-active')
      activeNav?.focus()
    }
  })
}

watch(
  () => props.section,
  () => {
    const pendingTitle = systemViews.consumePendingReveal()
    if (pendingTitle) {
      void nextTick(() => revealSetting(pendingTitle))
    }
    if (isKeyboardNavigation && !isPhone.value) {
      nextTick(() => {
        const heading = dialogRef.value?.querySelector<HTMLElement>('.settings-section-header__title, h2, h3')
        heading?.focus()
      })
    }
  },
)

onMounted(async () => {
  window.addEventListener('keydown', onWindowKeydown, true)
  window.addEventListener('pointerdown', onWindowPointerDown, true)

  focusActiveNavOrTopBar()

  await workspaceStore.loadDiagnostics()
  await workspaceStore.reloadPlugins()

  const pendingTitle = systemViews.consumePendingReveal()
  if (pendingTitle) {
    void nextTick(() => revealSetting(pendingTitle))
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown, true)
  window.removeEventListener('pointerdown', onWindowPointerDown, true)
})
</script>

<template>
  <section
    ref="dialogRef"
    class="settings-view tw:grid tw:h-full tw:min-h-0 tw:w-full tw:grid-cols-[240px_minmax(0,1fr)] tw:box-border tw:bg-[var(--workspace-editor-surface,var(--surface-canvas))] tw:text-content-primary tw:max-[900px]:grid-cols-[200px_minmax(0,1fr)] tw:max-[720px]:flex tw:max-[720px]:flex-col tw:max-[720px]:p-0"
    aria-labelledby="workspace-settings-heading"
  >
    <!-- Phone layout -->
    <div v-if="isPhone" class="mobile-settings tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:bg-[var(--frame-bg)]">
      <header class="mobile-settings__topbar tw:max-[719px]:min-h-[calc(56px+max(var(--safe-area-top),0px))] tw:max-[719px]:grid-cols-[44px_minmax(0,1fr)_44px] tw:max-[719px]:pt-[max(var(--safe-area-top),0px)] tw:max-[719px]:pr-[calc(8px+max(var(--safe-area-right),0px))] tw:max-[719px]:pb-0 tw:max-[719px]:pl-[calc(8px+max(var(--safe-area-left),0px))] tw:grid tw:flex-none tw:items-end tw:border-b-0 tw:bg-[var(--frame-bg)]">
        <button
          type="button"
          class="mobile-settings__back tw:grid tw:size-11 tw:place-items-center tw:rounded-[calc(13px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-content-secondary tw:active:bg-[var(--hover-strong)] tw:focus-visible:outline-2 tw:focus-visible:-outline-offset-2 tw:focus-visible:outline-accent"
          :aria-label="!section ? t('workspace.systemView.backToWorkspace') : t('workspace.back')"
          @click="mobileBack"
        >
          <ArrowLeft :size="20" aria-hidden="true" />
        </button>
        <h1 id="workspace-settings-heading" class="tw:m-0 tw:self-center tw:overflow-hidden tw:text-center tw:text-[17px] tw:leading-[1.2] tw:font-[650] tw:text-content-primary tw:text-ellipsis tw:whitespace-nowrap">
          {{ !section ? t('settings.title') : activeSectionLabel }}
        </h1>
        <span class="mobile-settings__topbar-spacer tw:size-11" aria-hidden="true" />
      </header>

      <MobileSettingsHome
        v-if="!section"
        :groups="mobileSectionGroups"
        :search-query="settingsSearch"
        :search-results="searchResults"
        @select="activateMobileSection"
        @select-result="openSearchResult"
        @update:search="settingsSearch = $event"
      />

      <main v-else class="settings-main mobile-settings__detail tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:max-[719px]:min-h-0 tw:max-[719px]:overflow-x-hidden tw:max-[719px]:overflow-y-auto tw:max-[719px]:overscroll-y-contain tw:max-[719px]:[-webkit-overflow-scrolling:touch]">
        <component :is="activePanelComponent" />
      </main>
    </div>

    <!-- Desktop layout -->
    <template v-else>
      <SettingsNavColumn
        :sections="sections"
        :active-section="activeSection"
        :search-query="settingsSearch"
        @select="activateDesktopSection"
        @back="emit('back')"
        @update:search="settingsSearch = $event"
      />

      <main class="settings-main tw:flex tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-hidden">
        <SettingsSearchResults
          v-if="settingsSearch"
          :search="settingsSearch"
          :results="searchResults"
          @select-result="openSearchResult"
        />
        <component :is="activePanelComponent" v-else />
      </main>
    </template>
  </section>
</template>
