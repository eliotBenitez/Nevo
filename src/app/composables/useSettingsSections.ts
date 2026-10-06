import { computed, defineAsyncComponent, markRaw, ref, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import {
  Archive,
  Bot,
  Code,
  Database,
  Eye,
  Folder,
  Info,
  Layers,
  Plug,
  Settings,
  Sparkles,
  SlidersHorizontal,
} from '@lucide/vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useThemeStore } from '../../stores/theme'
import type { SettingsSectionId } from '../../types/workspace'
import type { WorkspaceSettingSearchItem } from '../../types/search'
import { rankTitleBarResults } from '../search'
import { buildWorkspaceSettingsSearchItems } from '../search/settings'
import { getTotalPluginCount } from '../../utils/plugin-counts'

const SettingsAppearancePanel = defineAsyncComponent(() => import('../components/settings/SettingsAppearancePanel.vue'))
const SettingsEditorPanel = defineAsyncComponent(() => import('../components/settings/SettingsEditorPanel.vue'))
const SettingsAiPanel = defineAsyncComponent(() => import('../components/settings/SettingsAiPanel.vue'))
const SettingsPluginsPanel = defineAsyncComponent(() => import('../components/settings/SettingsPluginsPanel.vue'))
const SettingsMcpPanel = defineAsyncComponent(() => import('../components/settings/SettingsMcpPanel.vue'))
const SettingsHotkeysPanel = defineAsyncComponent(() => import('../components/settings/SettingsHotkeysPanel.vue'))
const SettingsAboutPanel = defineAsyncComponent(() => import('../components/settings/SettingsAboutPanel.vue'))
const SettingsGeneralPanel = defineAsyncComponent(() => import('../components/settings/SettingsGeneralPanel.vue'))
const SettingsWorkspacePanel = defineAsyncComponent(() => import('../components/settings/SettingsWorkspacePanel.vue'))
const SettingsFilesPanel = defineAsyncComponent(() => import('../components/settings/SettingsFilesPanel.vue'))
const SettingsBackupPanel = defineAsyncComponent(() => import('../components/settings/SettingsBackupPanel.vue'))
const SettingsAdvancedPanel = defineAsyncComponent(() => import('../components/settings/SettingsAdvancedPanel.vue'))

export interface SectionMeta {
  id: SettingsSectionId
  label: string
  icon: unknown
  count?: number
}

export interface MobileSectionItem {
  id: SettingsSectionId
  description: string
  section: SectionMeta
}

export interface MobileSectionGroup {
  label: string
  items: MobileSectionItem[]
}

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

export function useSettingsSections(options?: { isPhone?: Ref<boolean> }) {
  const { t } = useI18n()
  const workspaceStore = useWorkspaceStore()
  const themeStore = useThemeStore()
  const { manifest, settings, plugins, appConfig } = storeToRefs(workspaceStore)

  const isPhone = options?.isPhone ?? ref(false)
  const settingsSearch = ref('')

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

  const mobileSectionGroups = computed<MobileSectionGroup[]>(() => {
    const rawGroups: Array<{
      label: string
      items: Array<{ id: SettingsSectionId; description: string }>
    }> = [
      {
        label: t('settings.mobile.groups.primary'),
        items: [
          { id: 'general', description: t('settings.general.description') },
          { id: 'appearance', description: t('settings.mobile.descriptions.appearance') },
          { id: 'editor', description: t('settings.mobile.descriptions.editor') },
          { id: 'workspace', description: t('settings.mobile.descriptions.workspace') },
          { id: 'ai', description: t('settings.mobile.descriptions.ai') },
        ],
      },
      {
        label: t('settings.mobile.groups.system'),
        items: [
          { id: 'files', description: t('settings.mobile.descriptions.files') },
          { id: 'backup', description: t('settings.mobile.descriptions.backup') },
          { id: 'plugins', description: t('settings.mobile.descriptions.plugins') },
          { id: 'advanced', description: t('settings.advanced.description') },
          { id: 'about', description: t('settings.mobile.descriptions.about') },
        ],
      },
    ]

    return rawGroups.map(group => ({
      ...group,
      items: group.items
        .map(item => {
          const section = sections.value.find(s => s.id === item.id)
          return section ? { ...item, section } : null
        })
        .filter((item): item is MobileSectionItem => item !== null),
    }))
  })

  function getPanelComponent(sectionId: SettingsSectionId): unknown {
    return panelComponents[sectionId] ?? SettingsGeneralPanel
  }

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

  return {
    sections,
    mobileSectionGroups,
    panelComponents,
    getPanelComponent,
    settingsSearch,
    searchCatalog,
    searchResults,
  }
}
