import type { AppConfig, HotkeyBinding, HotkeyScope, RecentWorkspace, ThemeSchedule, WorkspaceHomeFavorite, WorkspaceSettings, WorkspaceView } from '../../types/workspace'
import { normalizeHotkeyChord } from '../hotkey-chords'
import { DEFAULT_HOTKEY_BINDINGS, createDefaultAppConfig, createDefaultWorkspaceSettings } from './defaults'

function normalizeHotkeyScope(scope: unknown): HotkeyScope {
  return scope === 'app' ? 'app' : 'workspace'
}

export function normalizeHotkeyBindings(bindings: unknown): HotkeyBinding[] {
  const defaults = new Map(DEFAULT_HOTKEY_BINDINGS.map(binding => [binding.commandId, { ...binding }]))
  const input = Array.isArray(bindings) ? bindings : []

  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as Partial<HotkeyBinding>
    const commandId = typeof raw.commandId === 'string' ? raw.commandId : ''
    if (!commandId) continue

    const base = defaults.get(commandId) ?? {
      commandId,
      label: typeof raw.label === 'string' ? raw.label : commandId,
      defaultChord: normalizeHotkeyChord(typeof raw.defaultChord === 'string' ? raw.defaultChord : '') ?? '',
      customChord: null,
      scope: normalizeHotkeyScope(raw.scope),
    }

    defaults.set(commandId, {
      commandId,
      label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : base.label,
      defaultChord: normalizeHotkeyChord(typeof raw.defaultChord === 'string' ? raw.defaultChord : base.defaultChord) ?? base.defaultChord,
      customChord: normalizeHotkeyChord(typeof raw.customChord === 'string' ? raw.customChord : null),
      scope: normalizeHotkeyScope(raw.scope ?? base.scope),
    })
  }

  return Array.from(defaults.values())
}

function clampFontSize(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 16
  return Math.max(12, Math.min(22, Math.round(numeric)))
}

function clampPositiveInt(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(min, Math.min(max, Math.round(numeric)))
}

function normalizeView(value: unknown): WorkspaceView {
  return value === 'table' || value === 'kanban' || value === 'graph' || value === 'last-note' || value === 'specific-note' ? value : 'editor'
}

function clampZoom(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return 100
  return Math.max(80, Math.min(120, Math.round(numeric / 5) * 5))
}

function normalizeTime(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback
}

function normalizeThemeSchedule(value: unknown, fallback: ThemeSchedule): ThemeSchedule {
  const raw = value && typeof value === 'object' ? value as Partial<ThemeSchedule> : {}
  return {
    enabled: raw.enabled === true,
    lightTime: normalizeTime(raw.lightTime, fallback.lightTime),
    darkTime: normalizeTime(raw.darkTime, fallback.darkTime),
  }
}

export function workspaceHomeFavoriteKey(favorite: WorkspaceHomeFavorite): string {
  if (favorite.kind === 'graph') return 'graph'
  if (favorite.kind === 'pluginView') {
    return `pluginView:${favorite.pluginId}:${favorite.contributionId}`
  }
  return `${favorite.kind}:${favorite.id}`
}

export function normalizeHomeFavorites(value: unknown): WorkspaceHomeFavorite[] {
  if (!Array.isArray(value)) return []

  const normalized: WorkspaceHomeFavorite[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const raw = entry as Record<string, unknown>
    let favorite: WorkspaceHomeFavorite | null = null

    if (raw.kind === 'graph') {
      favorite = { kind: 'graph' }
    } else if (
      (raw.kind === 'note' || raw.kind === 'folder' || raw.kind === 'board')
      && typeof raw.id === 'string'
      && raw.id.trim()
    ) {
      favorite = { kind: raw.kind, id: raw.id.trim() }
    } else if (
      raw.kind === 'pluginView'
      && typeof raw.pluginId === 'string'
      && raw.pluginId.trim()
      && typeof raw.contributionId === 'string'
      && raw.contributionId.trim()
    ) {
      favorite = {
        kind: 'pluginView',
        pluginId: raw.pluginId.trim(),
        contributionId: raw.contributionId.trim(),
      }
    }

    if (!favorite) continue
    const key = workspaceHomeFavoriteKey(favorite)
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(favorite)
    if (normalized.length === 8) break
  }

  return normalized
}

export function normalizeWorkspaceSettings(input: unknown): WorkspaceSettings {
  const defaults = createDefaultWorkspaceSettings()
  const raw = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const legacy = raw

  const normalized = JSON.parse(JSON.stringify(defaults)) as WorkspaceSettings
  const general = raw.general && typeof raw.general === 'object' ? raw.general as Record<string, unknown> : {}
  const appearance = raw.appearance && typeof raw.appearance === 'object' ? raw.appearance as Record<string, unknown> : {}
  const editor = raw.editor && typeof raw.editor === 'object' ? raw.editor as Record<string, unknown> : {}
  const workspace = raw.workspace && typeof raw.workspace === 'object' ? raw.workspace as Record<string, unknown> : {}
  const ai = raw.ai && typeof raw.ai === 'object' ? raw.ai as Record<string, unknown> : {}
  const plugins = raw.plugins && typeof raw.plugins === 'object' ? raw.plugins as Record<string, unknown> : {}
  const hotkeys = raw.hotkeys && typeof raw.hotkeys === 'object' ? raw.hotkeys as Record<string, unknown> : {}
  const files = raw.files && typeof raw.files === 'object' ? raw.files as Record<string, unknown> : {}
  const advanced = raw.advanced && typeof raw.advanced === 'object' ? raw.advanced as Record<string, unknown> : {}

  normalized.general.defaultStartupView = normalizeView(general.defaultStartupView ?? legacy.defaultView)
  normalized.general.restoreLastContext = typeof general.restoreLastContext === 'boolean' ? general.restoreLastContext : defaults.general.restoreLastContext
  normalized.general.recentItemsBehavior = general.recentItemsBehavior === 'manual' ? 'manual' : defaults.general.recentItemsBehavior
  normalized.general.confirmBeforeDelete = typeof general.confirmBeforeDelete === 'boolean' ? general.confirmBeforeDelete : defaults.general.confirmBeforeDelete
  normalized.general.startupNoteId = typeof general.startupNoteId === 'string' ? general.startupNoteId : null
  normalized.general.homeFavorites = normalizeHomeFavorites(general.homeFavorites)
  if (general.lastContext && typeof general.lastContext === 'object') {
    const lastContext = general.lastContext as Record<string, unknown>
    normalized.general.lastContext = {
      kind: lastContext.kind === 'note' || lastContext.kind === 'folder' ? lastContext.kind : 'workspace',
      noteId: typeof lastContext.noteId === 'string' ? lastContext.noteId : null,
      folderId: typeof lastContext.folderId === 'string' ? lastContext.folderId : null,
    }
  }

  normalized.appearance.accentPreset = typeof appearance.accentPreset === 'string'
    ? appearance.accentPreset
    : defaults.appearance.accentPreset
  normalized.appearance.backgroundScene = appearance.backgroundScene === 'paper' || appearance.backgroundScene === 'studio' || appearance.backgroundScene === 'plain'
    ? appearance.backgroundScene : defaults.appearance.backgroundScene
  normalized.appearance.surfaceStyle = appearance.surfaceStyle === 'solid' || appearance.surfaceStyle === 'tinted'
    ? appearance.surfaceStyle : defaults.appearance.surfaceStyle
  normalized.appearance.contrastMode = appearance.contrastMode === 'soft' || appearance.contrastMode === 'high'
    ? appearance.contrastMode : defaults.appearance.contrastMode
  normalized.appearance.sidebarStyle = appearance.sidebarStyle === 'solid' || appearance.sidebarStyle === 'minimal'
    ? appearance.sidebarStyle : defaults.appearance.sidebarStyle
  normalized.appearance.editorFontFamily = typeof appearance.editorFontFamily === 'string' && appearance.editorFontFamily.trim()
    ? appearance.editorFontFamily.trim() : defaults.appearance.editorFontFamily
  normalized.appearance.editorFontSize = clampFontSize(appearance.editorFontSize ?? legacy.editorFontSize)
  normalized.appearance.editorLineWidth = appearance.editorLineWidth === 'narrow' || appearance.editorLineWidth === 'wide'
    ? appearance.editorLineWidth
    : legacy.editorLineWidth === 'narrow' || legacy.editorLineWidth === 'wide'
      ? legacy.editorLineWidth as typeof defaults.appearance.editorLineWidth
      : defaults.appearance.editorLineWidth
  normalized.appearance.customCssEnabled = typeof appearance.customCssEnabled === 'boolean'
    ? appearance.customCssEnabled
    : defaults.appearance.customCssEnabled
  normalized.appearance.customCssFileName = typeof appearance.customCssFileName === 'string' && appearance.customCssFileName.trim()
    ? appearance.customCssFileName.trim()
    : defaults.appearance.customCssFileName
  normalized.appearance.accentColoredHeadings = typeof appearance.accentColoredHeadings === 'boolean'
    ? appearance.accentColoredHeadings
    : defaults.appearance.accentColoredHeadings

  normalized.editor.spellCheck = typeof editor.spellCheck === 'boolean'
    ? editor.spellCheck
    : typeof legacy.spellCheck === 'boolean' ? legacy.spellCheck : defaults.editor.spellCheck
  normalized.editor.markdownShortcuts = typeof editor.markdownShortcuts === 'boolean' ? editor.markdownShortcuts : defaults.editor.markdownShortcuts
  normalized.editor.slashCommands = typeof editor.slashCommands === 'boolean' ? editor.slashCommands : defaults.editor.slashCommands
  normalized.editor.smoothScrolling = typeof editor.smoothScrolling === 'boolean' ? editor.smoothScrolling : defaults.editor.smoothScrolling
  normalized.editor.caretAnimation = editor.caretAnimation === 'steady' || editor.caretAnimation === 'blink'
    ? editor.caretAnimation : defaults.editor.caretAnimation
  normalized.editor.tabKeyBehavior = editor.tabKeyBehavior === 'focus' ? 'focus' : defaults.editor.tabKeyBehavior
  normalized.editor.autosavePolicy = editor.autosavePolicy === 'window-idle' ? 'window-idle' : defaults.editor.autosavePolicy
  normalized.editor.focusMode = editor.focusMode === 'soft' ? 'soft' : defaults.editor.focusMode
  normalized.editor.typewriterScrolling = typeof editor.typewriterScrolling === 'boolean' ? editor.typewriterScrolling : defaults.editor.typewriterScrolling
  normalized.editor.activeBlockEmphasis = typeof editor.activeBlockEmphasis === 'boolean' ? editor.activeBlockEmphasis : defaults.editor.activeBlockEmphasis
  normalized.editor.pasteBehavior = editor.pasteBehavior === 'plain-text' ? 'plain-text' : defaults.editor.pasteBehavior
  normalized.editor.slashMenuHints = typeof editor.slashMenuHints === 'boolean' ? editor.slashMenuHints : defaults.editor.slashMenuHints
  normalized.editor.editorStatsVisibility = editor.editorStatsVisibility === 'corner' || (editor.editorStatsVisibility as string) === 'footer' ? 'corner' : defaults.editor.editorStatsVisibility
  normalized.editor.typewriterPosition = editor.typewriterPosition === 'upper' || editor.typewriterPosition === 'center' ? editor.typewriterPosition : defaults.editor.typewriterPosition

  normalized.workspace.defaultLandingView = normalizeView(workspace.defaultLandingView ?? normalized.general.defaultStartupView)
  normalized.workspace.showBacklinksByDefault = typeof workspace.showBacklinksByDefault === 'boolean' ? workspace.showBacklinksByDefault : defaults.workspace.showBacklinksByDefault
  normalized.workspace.showGraphLabels = typeof workspace.showGraphLabels === 'boolean' ? workspace.showGraphLabels : defaults.workspace.showGraphLabels
  normalized.workspace.folderCreateBehavior = 'current-folder'
  normalized.workspace.rootNotesVisible = typeof workspace.rootNotesVisible === 'boolean' ? workspace.rootNotesVisible : defaults.workspace.rootNotesVisible
  normalized.workspace.defaultSort = 'updated-desc'
  normalized.workspace.description = typeof workspace.description === 'string' ? workspace.description : defaults.workspace.description
  normalized.workspace.workspaceType = ['research', 'writing', 'product', 'knowledge-base'].includes(workspace.workspaceType as string)
    ? workspace.workspaceType as typeof defaults.workspace.workspaceType : defaults.workspace.workspaceType
  normalized.workspace.status = workspace.status === 'archived' || workspace.status === 'draft'
    ? workspace.status : defaults.workspace.status
  normalized.workspace.tags = Array.isArray(workspace.tags) ? workspace.tags.filter(t => typeof t === 'string') : defaults.workspace.tags
  normalized.workspace.openLastVisitedSystemView = typeof workspace.openLastVisitedSystemView === 'boolean' ? workspace.openLastVisitedSystemView : defaults.workspace.openLastVisitedSystemView
  normalized.workspace.rememberExpandedFolders = typeof workspace.rememberExpandedFolders === 'boolean' ? workspace.rememberExpandedFolders : defaults.workspace.rememberExpandedFolders
  normalized.workspace.sidebarDefaultState = workspace.sidebarDefaultState === 'collapsed' ? 'collapsed' : defaults.workspace.sidebarDefaultState
  normalized.workspace.newNotePlacement = workspace.newNotePlacement === 'root' ? 'root' : defaults.workspace.newNotePlacement
  normalized.workspace.newFolderPlacement = workspace.newFolderPlacement === 'root' ? 'root' : defaults.workspace.newFolderPlacement
  normalized.workspace.defaultChildSort = workspace.defaultChildSort === 'title-asc' || workspace.defaultChildSort === 'updated-desc'
    ? workspace.defaultChildSort : defaults.workspace.defaultChildSort
  normalized.workspace.showEmptyFolders = typeof workspace.showEmptyFolders === 'boolean' ? workspace.showEmptyFolders : defaults.workspace.showEmptyFolders
  normalized.workspace.defaultNoteIcon = typeof workspace.defaultNoteIcon === 'string' && workspace.defaultNoteIcon.trim() ? workspace.defaultNoteIcon.trim() : defaults.workspace.defaultNoteIcon
  normalized.workspace.defaultNoteTitlePattern = workspace.defaultNoteTitlePattern === 'date' || workspace.defaultNoteTitlePattern === 'date-time'
    ? workspace.defaultNoteTitlePattern : defaults.workspace.defaultNoteTitlePattern
  normalized.workspace.defaultFolderIcon = typeof workspace.defaultFolderIcon === 'string' && workspace.defaultFolderIcon.trim() ? workspace.defaultFolderIcon.trim() : defaults.workspace.defaultFolderIcon
  normalized.workspace.newNoteTemplate = typeof workspace.newNoteTemplate === 'string' && workspace.newNoteTemplate.trim()
    ? workspace.newNoteTemplate.trim()
    : defaults.workspace.newNoteTemplate
  normalized.workspace.newWorkspaceHomeNote = typeof workspace.newWorkspaceHomeNote === 'boolean' ? workspace.newWorkspaceHomeNote : defaults.workspace.newWorkspaceHomeNote
  normalized.workspace.autoCreateStarterStructure = workspace.autoCreateStarterStructure === 'off' || workspace.autoCreateStarterStructure === 'structured'
    ? workspace.autoCreateStarterStructure : defaults.workspace.autoCreateStarterStructure
  normalized.workspace.sidebarContentMode = workspace.sidebarContentMode === 'tag-preview'
    ? 'tag-preview'
    : defaults.workspace.sidebarContentMode
  normalized.workspace.sidebarLayout = workspace.sidebarLayout === 'floating'
    ? 'floating'
    : defaults.workspace.sidebarLayout
  normalized.workspace.sidebarSortMode = workspace.sidebarSortMode === 'name-asc' || workspace.sidebarSortMode === 'name-desc' || workspace.sidebarSortMode === 'updated'
    ? workspace.sidebarSortMode : defaults.workspace.sidebarSortMode
  normalized.workspace.graphEntryMode = workspace.graphEntryMode === 'from-current-note' ? 'from-current-note' : defaults.workspace.graphEntryMode
  normalized.workspace.graphScopeDefault = workspace.graphScopeDefault === 'current-folder' ? 'current-folder' : defaults.workspace.graphScopeDefault
  normalized.workspace.searchStartScope = workspace.searchStartScope === 'current-folder' ? 'current-folder' : defaults.workspace.searchStartScope
  normalized.workspace.historyDefaultRange = workspace.historyDefaultRange === '7d' || workspace.historyDefaultRange === 'all'
    ? workspace.historyDefaultRange : defaults.workspace.historyDefaultRange

  normalized.ai.enabled = typeof ai.enabled === 'boolean' ? ai.enabled : defaults.ai.enabled
  normalized.ai.privacyMode = typeof ai.privacyMode === 'boolean' ? ai.privacyMode : defaults.ai.privacyMode
  normalized.ai.defaultProvider = ai.defaultProvider === 'cloud' ? 'cloud' : defaults.ai.defaultProvider
  normalized.ai.apiKind = ai.apiKind === 'openai' ? 'openai' : defaults.ai.apiKind
  normalized.ai.defaultModel = typeof ai.defaultModel === 'string' && ai.defaultModel.trim() ? ai.defaultModel.trim() : defaults.ai.defaultModel
  normalized.ai.baseUrl = typeof ai.baseUrl === 'string' && ai.baseUrl.trim() ? ai.baseUrl.trim() : defaults.ai.baseUrl
  normalized.ai.slashCommands = typeof ai.slashCommands === 'boolean' ? ai.slashCommands : defaults.ai.slashCommands
  normalized.ai.contextualSuggestions = typeof ai.contextualSuggestions === 'boolean' ? ai.contextualSuggestions : defaults.ai.contextualSuggestions
  normalized.ai.streamingOutput = typeof ai.streamingOutput === 'boolean' ? ai.streamingOutput : defaults.ai.streamingOutput
  normalized.ai.maxTokensPerRequest = clampPositiveInt(ai.maxTokensPerRequest, defaults.ai.maxTokensPerRequest, 128, 8192)
  normalized.ai.cloudDailyBudgetUsd = clampPositiveInt(ai.cloudDailyBudgetUsd, defaults.ai.cloudDailyBudgetUsd, 0, 500)

  normalized.plugins.autoReloadOnLaunch = typeof plugins.autoReloadOnLaunch === 'boolean' ? plugins.autoReloadOnLaunch : defaults.plugins.autoReloadOnLaunch
  normalized.plugins.installSource = 'folder-only'

  const features = raw.features && typeof raw.features === 'object' ? raw.features as Record<string, unknown> : {}
  normalized.features.kanban = typeof features.kanban === 'boolean' ? features.kanban : defaults.features.kanban
  normalized.features.templates = typeof features.templates === 'boolean' ? features.templates : defaults.features.templates
  normalized.features.vega = typeof features.vega === 'boolean' ? features.vega : defaults.features.vega
  normalized.features.markmap = typeof features.markmap === 'boolean' ? features.markmap : defaults.features.markmap

  normalized.hotkeys.bindings = normalizeHotkeyBindings(hotkeys.bindings)

  normalized.files.attachmentImportBehavior = 'copy-into-workspace'
  normalized.files.snapshotRetentionCount = clampPositiveInt(files.snapshotRetentionCount, defaults.files.snapshotRetentionCount, 1, 200)
  normalized.files.trashRetentionDays = clampPositiveInt(files.trashRetentionDays, defaults.files.trashRetentionDays ?? 30, 0, 365)

  normalized.advanced.schemaVersion = 2
  normalized.advanced.experimentalGraphTools = typeof advanced.experimentalGraphTools === 'boolean'
    ? advanced.experimentalGraphTools : defaults.advanced.experimentalGraphTools
  normalized.advanced.developerLogging = typeof advanced.developerLogging === 'boolean' ? advanced.developerLogging : defaults.advanced.developerLogging

  normalized.pluginSettings = raw.pluginSettings && typeof raw.pluginSettings === 'object' && !Array.isArray(raw.pluginSettings)
    ? JSON.parse(JSON.stringify(raw.pluginSettings)) as Record<string, Record<string, unknown>>
    : {}

  return normalized
}

export function normalizeAppConfig(input: unknown): AppConfig {
  const defaults = createDefaultAppConfig()
  const raw = input && typeof input === 'object' ? input as Partial<AppConfig> : {}
  return {
    version: typeof raw.version === 'string' && raw.version.trim() ? raw.version : defaults.version,
    theme: raw.theme === 'dark' || raw.theme === 'light' || raw.theme === 'system' ? raw.theme : defaults.theme,
    locale: raw.locale === 'en' || raw.locale === 'ru' || raw.locale === 'fr' || raw.locale === 'es' || raw.locale === 'de' ? raw.locale : defaults.locale,
    recents: Array.isArray(raw.recents)
      ? raw.recents.map((r: { path?: string; storageId?: string; kind?: string }) => {
          const p = r.path
          if (!r.storageId && p?.startsWith('cloud:')) {
            r.kind = 'cloud'
            r.storageId = p.replace('cloud:', '')
          }
          return r as RecentWorkspace
        })
      : defaults.recents,
    interfaceDensity: raw.interfaceDensity === 'compact' ? 'compact' : defaults.interfaceDensity,
    reducedMotion: raw.reducedMotion === 'reduce' || raw.reducedMotion === 'full' ? raw.reducedMotion : defaults.reducedMotion,
    scrollbarVisibility: raw.scrollbarVisibility === 'thin' || raw.scrollbarVisibility === 'system' ? raw.scrollbarVisibility : defaults.scrollbarVisibility,
    focusRingStyle: raw.focusRingStyle === 'high-contrast' ? 'high-contrast' : defaults.focusRingStyle,
    windowChromeStyle: raw.windowChromeStyle === 'immersive' || raw.windowChromeStyle === 'minimal' ? raw.windowChromeStyle : defaults.windowChromeStyle,
    interfaceZoom: clampZoom(raw.interfaceZoom ?? defaults.interfaceZoom),
    reduceTransparency: typeof raw.reduceTransparency === 'boolean' ? raw.reduceTransparency : undefined,
    interfaceRoundness: raw.interfaceRoundness === 'sharp' || raw.interfaceRoundness === 'soft' ? raw.interfaceRoundness : defaults.interfaceRoundness,
    themeSchedule: normalizeThemeSchedule(raw.themeSchedule, defaults.themeSchedule),
  }
}
