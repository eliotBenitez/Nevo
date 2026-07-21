import type { FolderMeta, NoteMeta } from './note'
import type {
  NevoEditorCapability,
  NevoPluginCapability,
  NevoPluginExecutionMode,
  NevoWorkspaceCapability,
  NevoUiCapability,
} from './editor-plugin'

export type ThemeMode = 'dark' | 'light' | 'system'
export type AppLocale = 'ru' | 'en' | 'fr' | 'es' | 'de'
export type WorkspaceView = 'editor' | 'table' | 'kanban' | 'graph' | 'last-note' | 'specific-note'
export type AccentPreset = 'violet' | 'ember' | 'sage' | 'ocean' | 'rose' | (string & {})
export type InterfaceDensity = 'comfortable' | 'compact'
export type ReducedMotionMode = 'system' | 'reduce' | 'full'
export type ScrollbarVisibility = 'hidden' | 'thin' | 'system'
export type FocusRingStyle = 'accent' | 'high-contrast'
export type WindowChromeStyle = 'default' | 'immersive' | 'minimal'
export type InterfaceRoundness = 'sharp' | 'default' | 'soft'

export interface ThemeSchedule {
  enabled: boolean
  lightTime: string
  darkTime: string
}
export type BackgroundScene = 'aurora' | 'paper' | 'studio' | 'plain'
export type SurfaceStyle = 'glass' | 'solid' | 'tinted'
export type ContrastMode = 'soft' | 'balanced' | 'high'
export type SidebarStyle = 'floating' | 'solid' | 'minimal'
export type SidebarContentMode = 'tree' | 'tag-preview'
export type SidebarLayout = 'docked' | 'floating'
export type WorkspaceType = 'general' | 'research' | 'writing' | 'product' | 'knowledge-base'
export type WorkspaceStatus = 'active' | 'archived' | 'draft'
export type SidebarDefaultState = 'expanded' | 'collapsed'
export type NewItemPlacement = 'current-folder' | 'root'
export type DefaultChildSort = 'manual' | 'title-asc' | 'updated-desc'
export type DefaultNoteTitlePattern = 'untitled' | 'date' | 'date-time'
export type NewNoteTemplate = string
export type AutoCreateStarterStructure = 'off' | 'light' | 'structured'
export type GraphEntryMode = 'global' | 'from-current-note'
export type GraphScopeDefault = 'workspace' | 'current-folder'
export type SearchStartScope = 'workspace' | 'current-folder'
export type HistoryDefaultRange = '7d' | '30d' | 'all'
export type EditorFontFamily = string
export type EditorLineWidth = 'narrow' | 'medium' | 'wide'
export type CaretAnimationMode = 'system' | 'steady' | 'blink'
export type TabKeyBehavior = 'indent' | 'focus'
export type AutosavePolicy = 'immediate' | 'window-idle'
export type FocusMode = 'off' | 'soft'
export type PasteBehavior = 'smart' | 'plain-text'
export type EditorStatsVisibility = 'off' | 'corner'
export type EditorTypewriterPosition = 'upper' | 'center' | 'lower'
export type RecentItemsBehavior = 'remember' | 'manual'
export type AIProviderKind = 'local' | 'cloud'
export type AIApiKind = 'ollama' | 'openai'
export type PluginInstallSource = 'folder-only' | 'marketplace'
export type PluginKind = 'system' | 'user' | 'marketplace'
export type PluginSource = 'bundled' | 'folder' | 'marketplace'
export type AttachmentImportBehavior = 'copy-into-workspace'
export type HotkeyScope = 'workspace' | 'app'
export type SettingsSectionId =
  | 'general'
  | 'appearance'
  | 'editor'
  | 'workspace'
  | 'ai'
  | 'plugins'
  | 'hotkeys'
  | 'files'
  | 'advanced'
  | 'about'

export interface RecentWorkspace {
  id: string
  name: string
  glyph: string
  gradient: string
  path: string
  lastOpened: string
  pageCount: number
  pinned?: boolean
  unreadCount?: number
  /** 'cloud' for server-hosted shared storages; absent/'local' for filesystem workspaces. */
  kind?: 'local' | 'cloud'
  /** Set when kind === 'cloud': the shared storage id used to open it. */
  storageId?: string
  /** Set when kind === 'cloud': base URL of the relay hosting this storage. */
  serverUrl?: string
}

export interface WorkspaceConfig {
  name: string
  glyph: string
  gradient: string
  path: string
  template: 'empty' | 'researcher' | 'pm' | 'writer'
}

export interface TrashedItem {
  id: string
  type: 'note' | 'folder'
  title: string
  deletedAt: string
  originalParentId: string | null
  icon?: string
}

export interface WorkspaceManifest {
  id: string
  name: string
  glyph: string
  gradient: string
  schemaVersion: number
  createdAt: string
  rootOrder: string[]
  tree: FolderMeta[]
  rootNotes: NoteMeta[]
  trash?: TrashedItem[]
  /** Persisted user ordering of note ids for the tag-preview sidebar mode.
   *  Backward-compatible: absent or stale arrays fall back to natural preview order. */
  sidebarNoteOrder?: string[]
}

export interface WorkspaceLastContext {
  kind: 'workspace' | 'folder' | 'note'
  folderId: string | null
  noteId: string | null
}

export type WorkspaceHomeFavorite =
  | { kind: 'note' | 'folder' | 'board'; id: string }
  | { kind: 'graph' }
  | { kind: 'pluginView'; pluginId: string; contributionId: string }

export interface GeneralSettings {
  defaultStartupView: WorkspaceView
  restoreLastContext: boolean
  recentItemsBehavior: RecentItemsBehavior
  confirmBeforeDelete: boolean
  lastContext: WorkspaceLastContext
  startupNoteId: string | null
  homeFavorites: WorkspaceHomeFavorite[]
}

export interface AppearanceSettings {
  accentPreset: AccentPreset
  backgroundScene: BackgroundScene
  surfaceStyle: SurfaceStyle
  contrastMode: ContrastMode
  sidebarStyle: SidebarStyle
  editorFontFamily: EditorFontFamily
  editorFontSize: number
  editorLineWidth: EditorLineWidth
  customCssEnabled: boolean
  customCssFileName: string
  accentColoredHeadings: boolean
}

export interface EditorSettings {
  spellCheck: boolean
  markdownShortcuts: boolean
  slashCommands: boolean
  smoothScrolling: boolean
  caretAnimation: CaretAnimationMode
  tabKeyBehavior: TabKeyBehavior
  autosavePolicy: AutosavePolicy
  focusMode: FocusMode
  typewriterScrolling: boolean
  activeBlockEmphasis: boolean
  pasteBehavior: PasteBehavior
  slashMenuHints: boolean
  editorStatsVisibility: EditorStatsVisibility
  typewriterPosition: EditorTypewriterPosition
}

export interface WorkspaceBehaviorSettings {
  defaultLandingView: WorkspaceView
  showBacklinksByDefault: boolean
  showGraphLabels: boolean
  folderCreateBehavior: 'current-folder'
  rootNotesVisible: boolean
  defaultSort: 'updated-desc'
  // Metadata
  description: string
  workspaceType: WorkspaceType
  status: WorkspaceStatus
  tags: string[]
  // Navigation
  openLastVisitedSystemView: boolean
  rememberExpandedFolders: boolean
  sidebarDefaultState: SidebarDefaultState
  // Structure
  newNotePlacement: NewItemPlacement
  newFolderPlacement: NewItemPlacement
  defaultChildSort: DefaultChildSort
  showEmptyFolders: boolean
  // Creation defaults
  defaultNoteIcon: string
  defaultNoteTitlePattern: DefaultNoteTitlePattern
  defaultFolderIcon: string
  newNoteTemplate: NewNoteTemplate
  newWorkspaceHomeNote: boolean
  autoCreateStarterStructure: AutoCreateStarterStructure
  // Sidebar
  sidebarContentMode: SidebarContentMode
  sidebarLayout: SidebarLayout
  sidebarSortMode: 'manual' | 'name-asc' | 'name-desc' | 'updated'
  // System views
  graphEntryMode: GraphEntryMode
  graphScopeDefault: GraphScopeDefault
  searchStartScope: SearchStartScope
  historyDefaultRange: HistoryDefaultRange
}

export interface AISettings {
  enabled: boolean
  privacyMode: boolean
  defaultProvider: AIProviderKind
  apiKind: AIApiKind
  defaultModel: string
  baseUrl: string
  slashCommands: boolean
  contextualSuggestions: boolean
  streamingOutput: boolean
  maxTokensPerRequest: number
  cloudDailyBudgetUsd: number
}

export interface PluginsSettings {
  autoReloadOnLaunch: boolean
  installSource: PluginInstallSource
}

export interface FeaturesSettings {
  kanban: boolean
  templates?: boolean
  vega?: boolean
  markmap?: boolean
  draw?: boolean
}

export interface HotkeyBinding {
  commandId: string
  label: string
  defaultChord: string
  customChord: string | null
  scope: HotkeyScope
}

export interface HotkeysSettings {
  bindings: HotkeyBinding[]
}

export interface FilesSettings {
  attachmentImportBehavior: AttachmentImportBehavior
  snapshotRetentionCount: number
  trashRetentionDays?: number
}

export interface AdvancedSettings {
  schemaVersion: number
  experimentalGraphTools: boolean
  developerLogging: boolean
}

export interface WorkspaceSettings {
  general: GeneralSettings
  appearance: AppearanceSettings
  editor: EditorSettings
  workspace: WorkspaceBehaviorSettings
  ai: AISettings
  plugins: PluginsSettings
  pluginSettings: Record<string, Record<string, unknown>>
  features: FeaturesSettings
  hotkeys: HotkeysSettings
  files: FilesSettings
  advanced: AdvancedSettings
}

export interface PluginSettingField {
  key: string
  type: 'text' | 'password' | 'textarea' | 'select' | 'number' | 'checkbox'
  label?: string
  description?: string
  placeholder?: string
  options?: { value: string; label: string }[]
  default?: unknown
  min?: number
  max?: number
  step?: number
  /** Хранить значение в secure_store (secrets.json), а не в pluginSettings. */
  secret?: boolean
}

export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  enabled: boolean
  kind?: PluginKind
  source?: PluginSource
  entryPoint: string
  apiVersion: string
  executionMode?: NevoPluginExecutionMode
  dataVersion?: number
  capabilities?: NevoPluginCapability[]
  editorCapabilities: NevoEditorCapability[]
  uiCapabilities?: NevoUiCapability[]
  workspaceCapabilities?: NevoWorkspaceCapability[]
  network?: {
    hosts: string[]
    methods: Array<'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>
  }
  nevoVersionRange?: string
  priority?: number
  settingsSchema?: PluginSettingField[]
}

export type MarketplacePluginStatus =
  | 'notInstalled'
  | 'installed'
  | 'updateAvailable'
  | 'disabled'
  | 'invalid'
  | 'conflict'

export interface MarketplaceCatalogItem {
  pluginId: string
  pluginPath: string
  treeSha: string
  status: MarketplacePluginStatus
  manifest: PluginManifest | null
  manifestError: string | null
  installedVersion: string | null
  sourceUrl: string
  files: string[]
  permissionFingerprint: string | null
}

export interface MarketplaceCatalog {
  repo: string
  branch: string
  updatedAt: string
  fromCache: boolean
  error: string | null
  plugins: MarketplaceCatalogItem[]
}

export interface MarketplacePreparedPlugin {
  transactionId: string
  manifest: PluginManifest
  previousDataVersion: number | null
  permissionFingerprint: string
}

export interface MarketplaceMigrationBundle {
  workspaceStorage?: Record<string, unknown>
  pluginRegistry?: Record<string, unknown>
  collabStatesBase64?: Record<string, string>
}

export interface AppConfig {
  version: string
  theme: ThemeMode
  locale: AppLocale
  recents: RecentWorkspace[]
  interfaceDensity: InterfaceDensity
  reducedMotion: ReducedMotionMode
  scrollbarVisibility: ScrollbarVisibility
  focusRingStyle: FocusRingStyle
  windowChromeStyle: WindowChromeStyle
  interfaceZoom: number
  /** Tri-state: `undefined` means "auto" — enabled on Linux/WebKitGTK (where
   *  backdrop-filter is expensive) and disabled elsewhere. An explicit boolean
   *  is a manual user override. */
  reduceTransparency?: boolean
  interfaceRoundness: InterfaceRoundness
  themeSchedule: ThemeSchedule
}

export interface WorkspaceDiagnostics {
  workspacePath: string
  notesFolderPath: string
  assetsFolderPath: string
  nevoFolderPath: string
  settingsPath: string
  logsPath: string
  noteCount: number
  folderCount: number
  pluginCount: number
  snapshotCount: number
  assetCount: number
  workspaceBytes: number
  notesBytes: number
  assetsBytes: number
  snapshotsBytes: number
}

export interface WorkspaceCleanupReport {
  removedFiles: number
  bytesFreed: number
}

export interface AppMetadata {
  version: string
  engine: string
  runtime: 'desktop' | 'android' | 'ios' | 'web'
  platform: string
  appDataDir: string
  configPath: string
  logsPath: string
  supportsWindowControls: boolean
  supportsGlobalShortcuts: boolean
  supportsRevealInFileManager: boolean
  supportsWindowDragRegions: boolean
}

export type OnboardingView = 'welcome' | 'create' | 'open'
