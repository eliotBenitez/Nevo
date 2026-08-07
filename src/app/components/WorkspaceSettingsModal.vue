<script setup lang="ts">
import { computed, defineAsyncComponent, markRaw, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Bot,
  ChevronRight,
  Code,
  Database,
  Eye,
  Folder,
  Info,
  Layers,
  Plug,
  Search,
  SearchX,
  Settings,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-vue-next'
import { X } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../stores/workspace'
import { useDeviceLayout } from '../../composables/useDeviceLayout'
import type { SettingsSectionId } from '../../types/workspace'
import type { WorkspaceSettingSearchItem } from '../../types/search'
import { useFocusTrap } from '../../ui/composables/useFocusTrap'
import { rankTitleBarResults } from '../search'
import { buildWorkspaceSettingsSearchItems } from '../search/settings'
import { useSettingsHotkeys } from '../composables/useSettingsHotkeys'
import { useThemeStore } from '../../stores/theme'
import { getTotalPluginCount } from '../../utils/plugin-counts'
import { useMobileBackButton } from '../../composables/useMobileBackButton'
// Panels are loaded on demand: only the active section is mounted at a time
// (see the v-else-if chain in the template), so deferring their import keeps the
// settings modal's first paint cheap and avoids loading 10 panels up front.
const SettingsAppearancePanel = defineAsyncComponent(() => import('./settings/SettingsAppearancePanel.vue'))
const SettingsEditorPanel = defineAsyncComponent(() => import('./settings/SettingsEditorPanel.vue'))
const SettingsAiPanel = defineAsyncComponent(() => import('./settings/SettingsAiPanel.vue'))
const SettingsPluginsPanel = defineAsyncComponent(() => import('./settings/SettingsPluginsPanel.vue'))
const SettingsMcpPanel = defineAsyncComponent(() => import('./settings/SettingsMcpPanel.vue'))
const SettingsHotkeysPanel = defineAsyncComponent(() => import('./settings/SettingsHotkeysPanel.vue'))
const SettingsAboutPanel = defineAsyncComponent(() => import('./settings/SettingsAboutPanel.vue'))
const SettingsGeneralPanel = defineAsyncComponent(() => import('./settings/SettingsGeneralPanel.vue'))
const SettingsWorkspacePanel = defineAsyncComponent(() => import('./settings/SettingsWorkspacePanel.vue'))
const SettingsFilesPanel = defineAsyncComponent(() => import('./settings/SettingsFilesPanel.vue'))
const SettingsBackupPanel = defineAsyncComponent(() => import('./settings/SettingsBackupPanel.vue'))
const SettingsAdvancedPanel = defineAsyncComponent(() => import('./settings/SettingsAdvancedPanel.vue'))

interface Props {
  open: boolean
  initialSection?: SettingsSectionId | null
}

interface SectionMeta {
  id: SettingsSectionId
  label: string
  icon: unknown
  count?: number
}

const props = defineProps<Props>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const { isPhone, useFullscreenDialogs } = useDeviceLayout()

const workspaceStore = useWorkspaceStore()
const themeStore = useThemeStore()
const { manifest, settings, plugins, appMetadata, appConfig } = storeToRefs(workspaceStore)

const dialogRef = ref<HTMLElement | null>(null)
const { activate, deactivate } = useFocusTrap(dialogRef, computed(() => props.open))
watch(() => props.open, (open) => { if (open) nextTick(activate); else deactivate() })

const activeSection = ref<SettingsSectionId>('general')
const mobilePage = ref<'root' | 'detail'>('root')
const settingsSearch = ref('')
const { capturingBindingId } = useSettingsHotkeys()
const pluginSectionCount = computed(() => getTotalPluginCount(plugins.value))

const sections = computed<SectionMeta[]>(() => {
  const items: SectionMeta[] = [
    { id: 'general', label: t('settings.sections.general'), icon: markRaw(Settings) },
    { id: 'appearance', label: t('settings.sections.appearance'), icon: markRaw(Eye) },
    { id: 'editor', label: t('settings.sections.editor'), icon: markRaw(SlidersHorizontal) },
    { id: 'workspace', label: t('settings.sections.workspace'), icon: markRaw(Folder) },
    { id: 'ai', label: t('settings.sections.ai'), icon: markRaw(Sparkles) },
    { id: 'plugins', label: t('settings.sections.plugins'), icon: markRaw(Plug), count: pluginSectionCount.value },
    { id: 'mcp', label: t('settings.sections.mcp'), icon: markRaw(Bot) },
    { id: 'hotkeys', label: t('settings.sections.hotkeys'), icon: markRaw(Code) },
    { id: 'files', label: t('settings.sections.files'), icon: markRaw(Database) },
    { id: 'backup', label: t('settings.sections.backup'), icon: markRaw(Archive) },
    { id: 'advanced', label: t('settings.sections.advanced'), icon: markRaw(Layers) },
    { id: 'about', label: t('settings.sections.about'), icon: markRaw(Info) },
  ]
  return isPhone.value
    ? items.filter(section => section.id !== 'mcp' && section.id !== 'hotkeys')
    : items
})

const mobileSectionGroups = computed(() => [
  {
    label: t('settings.mobile.groups.primary'),
    items: [
      { id: 'appearance' as const, description: t('settings.mobile.descriptions.appearance') },
      { id: 'editor' as const, description: t('settings.mobile.descriptions.editor') },
      { id: 'workspace' as const, description: t('settings.mobile.descriptions.workspace') },
      { id: 'ai' as const, description: t('settings.mobile.descriptions.ai') },
    ],
  },
  {
    label: t('settings.mobile.groups.system'),
    items: [
      { id: 'files' as const, description: t('settings.mobile.descriptions.files') },
      { id: 'backup' as const, description: t('settings.mobile.descriptions.backup') },
      { id: 'plugins' as const, description: t('settings.mobile.descriptions.plugins') },
      { id: 'about' as const, description: t('settings.mobile.descriptions.about') },
    ],
  },
].map(group => ({
  ...group,
  items: group.items.map(item => ({
    ...item,
    section: sections.value.find(section => section.id === item.id)!,
  })),
})))

const panelComponents: Record<SettingsSectionId, unknown> = {
  general: SettingsGeneralPanel,
  appearance: SettingsAppearancePanel,
  editor: SettingsEditorPanel,
  workspace: SettingsWorkspacePanel,
  ai: SettingsAiPanel,
  plugins: SettingsPluginsPanel,
  mcp: SettingsMcpPanel,
  hotkeys: SettingsHotkeysPanel,
  files: SettingsFilesPanel,
  backup: SettingsBackupPanel,
  advanced: SettingsAdvancedPanel,
  about: SettingsAboutPanel,
}

const activePanelComponent = computed(() => panelComponents[activeSection.value])
const activeSectionLabel = computed(() =>
  sections.value.find(section => section.id === activeSection.value)?.label ?? t('settings.title'),
)

const searchCatalog = computed(() => buildWorkspaceSettingsSearchItems({
  t,
  manifest: manifest.value,
  settings: settings.value,
  appConfig: appConfig.value,
  plugins: plugins.value,
  pluginValidation: {},
  locale: appConfig.value.locale,
  themeMode: themeStore.theme,
}))

const searchResults = computed<WorkspaceSettingSearchItem[]>(() =>
  rankTitleBarResults(settingsSearch.value, searchCatalog.value)
    .filter((item): item is WorkspaceSettingSearchItem =>
      item.type === 'setting'
      && (!isPhone.value || (item.section !== 'mcp' && item.section !== 'hotkeys')),
    ),
)

watch(
  () => props.open,
  async (open) => {
    toggleEscapeListener(open)
    if (!open) return
    settingsSearch.value = ''
    const requestedSection = props.initialSection ?? 'general'
    activeSection.value = sections.value.some(section => section.id === requestedSection)
      ? requestedSection
      : 'general'
    mobilePage.value = props.initialSection ? 'detail' : 'root'
    await workspaceStore.loadDiagnostics()
    await workspaceStore.reloadPlugins()
  },
  { immediate: true },
)

watch(
  () => props.initialSection,
  (nextSection) => {
    if (!props.open || !nextSection) return
    activeSection.value = sections.value.some(section => section.id === nextSection)
      ? nextSection
      : 'general'
    if (isPhone.value) mobilePage.value = 'detail'
  },
)

onBeforeUnmount(() => { toggleEscapeListener(false) })

function activateSection(sectionId: SettingsSectionId) {
  activeSection.value = sectionId
  settingsSearch.value = ''
  if (isPhone.value) mobilePage.value = 'detail'
}

function mobileBack() {
  if (settingsSearch.value) {
    settingsSearch.value = ''
    return
  }
  if (mobilePage.value === 'detail') {
    mobilePage.value = 'root'
    return
  }
  close()
}

function close() {
  capturingBindingId.value = null
  emit('close')
}

function onWindowKeydown(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Escape') return
  if (document.body.classList.contains('nv-select-open')) return
  if (capturingBindingId.value) {
    event.preventDefault()
    event.stopPropagation()
    capturingBindingId.value = null
    return
  }
  event.preventDefault()
  event.stopPropagation()
  close()
}

function toggleEscapeListener(enabled: boolean) {
  window.removeEventListener('keydown', onWindowKeydown, true)
  if (enabled) window.addEventListener('keydown', onWindowKeydown, true)
}

useMobileBackButton(
  mobileBack,
  computed(() => props.open && isPhone.value),
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="settings-backdrop" @click.self="close">
      <section
        ref="dialogRef"
        class="settings-window"
        :class="{ 'settings-window--fullscreen': useFullscreenDialogs }"
        role="dialog"
        aria-modal="true"
        :aria-label="t('settings.title')"
      >
        <div v-if="!isPhone" class="settings-window__titlebar">
          <span>{{ t('settings.title') }}</span>
          <button type="button" class="settings-window__close" :aria-label="t('workspace.context.cancel')" @click="close">
            <X :size="15" />
          </button>
        </div>

        <div v-if="isPhone" class="mobile-settings">
          <header class="mobile-settings__topbar">
            <button
              type="button"
              class="mobile-settings__back"
              :aria-label="mobilePage === 'root' ? t('workspace.context.cancel') : t('workspace.back')"
              @click="mobileBack"
            >
              <ArrowLeft :size="20" />
            </button>
            <h1>{{ mobilePage === 'root' ? t('settings.title') : activeSectionLabel }}</h1>
            <span class="mobile-settings__topbar-spacer" aria-hidden="true" />
          </header>

          <main v-if="mobilePage === 'root'" class="mobile-settings__home">
            <label class="mobile-settings__search">
              <Search :size="18" aria-hidden="true" />
              <input
                v-model="settingsSearch"
                type="search"
                :placeholder="t('settings.search.placeholder')"
                :aria-label="t('settings.search.label')"
                autocomplete="off"
              >
            </label>

            <section v-if="settingsSearch" class="mobile-settings__group">
              <div class="mobile-settings__group-label">
                {{ t('settings.search.resultsCount', { count: searchResults.length }) }}
              </div>
              <div class="mobile-settings__list">
                <button
                  v-for="result in searchResults"
                  :key="result.id"
                  type="button"
                  class="mobile-settings__row"
                  @click="activateSection(result.section)"
                >
                  <span class="mobile-settings__row-copy">
                    <strong>{{ result.title }}</strong>
                    <small>{{ result.sectionLabel }} · {{ result.description }}</small>
                  </span>
                  <ChevronRight :size="18" aria-hidden="true" />
                </button>
                <div v-if="searchResults.length === 0" class="mobile-settings__empty">
                  <SearchX :size="24" aria-hidden="true" />
                  <strong>{{ t('settings.search.emptyTitle') }}</strong>
                  <span>{{ t('settings.search.emptyDescription') }}</span>
                </div>
              </div>
            </section>

            <template v-else>
              <section
                v-for="group in mobileSectionGroups"
                :key="group.label"
                class="mobile-settings__group"
              >
                <div class="mobile-settings__group-label">{{ group.label }}</div>
                <div class="mobile-settings__list">
                  <button
                    v-for="item in group.items"
                    :key="item.id"
                    type="button"
                    class="mobile-settings__row"
                    @click="activateSection(item.id)"
                  >
                    <span class="mobile-settings__icon">
                      <component :is="item.section.icon" :size="19" />
                    </span>
                    <span class="mobile-settings__row-copy">
                      <strong>{{ item.section.label }}</strong>
                      <small>{{ item.description }}</small>
                    </span>
                    <span v-if="item.section.count" class="mobile-settings__count">{{ item.section.count }}</span>
                    <ChevronRight :size="18" aria-hidden="true" />
                  </button>
                </div>
              </section>
            </template>

            <div class="mobile-settings__version">
              Nevo · v{{ appMetadata?.version ?? '0.1.0' }}
            </div>
          </main>

          <main v-else class="settings-main mobile-settings__detail">
            <component :is="activePanelComponent" />
          </main>
        </div>

        <div v-else class="settings-shell">
          <div class="settings-content">
            <aside class="settings-sidebar">
              <div class="settings-sidebar__head">
                <span class="settings-sidebar__mark">
                  <Settings :size="14" />
                </span>
                <span class="settings-sidebar__title">{{ t('settings.title') }}</span>
                <div class="spacer" />
                <kbd class="nv-kbd">⌘,</kbd>
              </div>

              <div class="settings-sidebar__search">
                <label class="settings-sr-only" for="workspace-settings-search">{{ t('settings.search.label') }}</label>
                <div class="search-field" :class="{ 'search-field--active': settingsSearch }">
                  <Search :size="12" class="sidebar-icon--muted" />
                  <input
                    id="workspace-settings-search"
                    v-model="settingsSearch"
                    class="search-input"
                    type="search"
                    :placeholder="t('settings.search.placeholder')"
                    :aria-label="t('settings.search.label')"
                    autocomplete="off"
                  >
                </div>
              </div>

              <nav class="settings-nav" :aria-label="t('settings.navigationLabel')">
                <button
                  v-for="section in sections"
                  :key="section.id"
                  type="button"
                  class="settings-nav__item"
                  :class="{ 'is-active': !settingsSearch && activeSection === section.id }"
                  :aria-current="!settingsSearch && activeSection === section.id ? 'page' : undefined"
                  @click="activateSection(section.id)"
                >
                  <component :is="section.icon" :size="13" class="settings-nav__icon" />
                  <span class="settings-nav__label">{{ section.label }}</span>
                  <span v-if="section.count" class="settings-nav__count">{{ section.count }}</span>
                </button>
              </nav>

              <div class="settings-sidebar__foot">
                Nevo · v{{ appMetadata?.version ?? '0.1.0' }} · {{ appMetadata?.platform ?? t('settings.common.desktop') }}
              </div>
            </aside>

            <main class="settings-main">
              <template v-if="settingsSearch">
                <section class="panel">
                  <header class="panel-header">
                    <div>
                      <h2 class="panel-title">{{ t('settings.search.resultsTitle', { query: settingsSearch }) }}</h2>
                      <p class="panel-sub">{{ t('settings.search.resultsCount', { count: searchResults.length }) }}</p>
                    </div>
                  </header>
                  <div class="panel-body">
                    <div class="results-card">
                      <button
                        v-for="result in searchResults"
                        :key="result.id"
                        type="button"
                        class="result-row"
                        :aria-label="t('settings.search.openResult', { title: result.title, section: result.sectionLabel })"
                        @click="activateSection(result.section)"
                      >
                        <div class="result-row__meta">
                          <span class="result-pill">{{ result.sectionLabel }}</span>
                          <div>
                            <div class="result-row__title">{{ result.title }}</div>
                            <div class="result-row__desc">{{ result.description }}</div>
                          </div>
                        </div>
                        <div class="result-row__side">
                          <div class="result-row__value">{{ result.value }}</div>
                          <ArrowRight :size="14" class="result-row__arrow" aria-hidden="true" />
                        </div>
                      </button>
                      <div v-if="searchResults.length === 0" class="empty-state">
                        <SearchX :size="24" class="empty-state__icon" aria-hidden="true" />
                        <div class="empty-state__title">{{ t('settings.search.emptyTitle') }}</div>
                        <div class="empty-state__sub">{{ t('settings.search.emptyDescription') }}</div>
                      </div>
                    </div>
                  </div>
                </section>
              </template>

              <component :is="activePanelComponent" v-else />
            </main>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>
