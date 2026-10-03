import type { AppConfig, HotkeyBinding, WorkspaceSettings } from '../../types/workspace'

export const DEFAULT_HOTKEY_BINDINGS: HotkeyBinding[] = [
  { commandId: 'core.undo', label: 'core.undo', defaultChord: 'Ctrl+Z', customChord: null, scope: 'workspace' },
  { commandId: 'core.redo', label: 'core.redo', defaultChord: 'Ctrl+Shift+Z', customChord: null, scope: 'workspace' },
  { commandId: 'core.bold', label: 'core.bold', defaultChord: 'Ctrl+B', customChord: null, scope: 'workspace' },
  { commandId: 'core.italic', label: 'core.italic', defaultChord: 'Ctrl+I', customChord: null, scope: 'workspace' },
  { commandId: 'core.strikethrough', label: 'core.strikethrough', defaultChord: 'Ctrl+Shift+S', customChord: null, scope: 'workspace' },
  { commandId: 'core.underline', label: 'core.underline', defaultChord: 'Ctrl+U', customChord: null, scope: 'workspace' },
  { commandId: 'core.kbd', label: 'core.kbd', defaultChord: 'Ctrl+E', customChord: null, scope: 'workspace' },
  { commandId: 'core.tag', label: 'core.tag', defaultChord: 'Ctrl+Shift+T', customChord: null, scope: 'workspace' },
  { commandId: 'core.heading.1', label: 'core.heading.1', defaultChord: 'Ctrl+Alt+1', customChord: null, scope: 'workspace' },
  { commandId: 'core.heading.2', label: 'core.heading.2', defaultChord: 'Ctrl+Alt+2', customChord: null, scope: 'workspace' },
  { commandId: 'core.heading.3', label: 'core.heading.3', defaultChord: 'Ctrl+Alt+3', customChord: null, scope: 'workspace' },
  { commandId: 'core.heading.4', label: 'core.heading.4', defaultChord: 'Ctrl+Alt+4', customChord: null, scope: 'workspace' },
  { commandId: 'core.heading.5', label: 'core.heading.5', defaultChord: 'Ctrl+Alt+5', customChord: null, scope: 'workspace' },
  { commandId: 'core.heading.6', label: 'core.heading.6', defaultChord: 'Ctrl+Alt+6', customChord: null, scope: 'workspace' },
  { commandId: 'core.orderedList', label: 'core.orderedList', defaultChord: 'Ctrl+Shift+7', customChord: null, scope: 'workspace' },
  { commandId: 'core.bulletList', label: 'core.bulletList', defaultChord: 'Ctrl+Shift+8', customChord: null, scope: 'workspace' },
  { commandId: 'core.blockquote', label: 'core.blockquote', defaultChord: 'Ctrl+Shift+9', customChord: null, scope: 'workspace' },
  { commandId: 'core.math.inline.insert', label: 'core.math.inline.insert', defaultChord: 'Ctrl+M', customChord: null, scope: 'workspace' },
  { commandId: 'editor.find-in-note', label: 'editor.find-in-note', defaultChord: 'Ctrl+F', customChord: null, scope: 'workspace' },
  { commandId: 'editor.replace-in-note', label: 'editor.replace-in-note', defaultChord: 'Ctrl+H', customChord: null, scope: 'workspace' },
  { commandId: 'workspace.new-note', label: 'workspace.new-note', defaultChord: 'Ctrl+N', customChord: null, scope: 'workspace' },
  { commandId: 'workspace.new-folder', label: 'workspace.new-folder', defaultChord: 'Ctrl+Shift+N', customChord: null, scope: 'workspace' },
  { commandId: 'workspace.save-note', label: 'workspace.save-note', defaultChord: 'Ctrl+S', customChord: null, scope: 'workspace' },
  { commandId: 'workspace.search', label: 'workspace.search', defaultChord: 'Ctrl+P', customChord: null, scope: 'workspace' },
  { commandId: 'workspace.toggle-sidebar', label: 'workspace.toggle-sidebar', defaultChord: 'Ctrl+\\', customChord: null, scope: 'workspace' },
  { commandId: 'workspace.toggle-right-panel', label: 'workspace.toggle-right-panel', defaultChord: 'Ctrl+Alt+\\', customChord: null, scope: 'workspace' },
  { commandId: 'workspace.open-graph', label: 'workspace.open-graph', defaultChord: 'Ctrl+Alt+G', customChord: null, scope: 'workspace' },
  { commandId: 'workspace.open-history', label: 'workspace.open-history', defaultChord: 'Ctrl+Alt+H', customChord: null, scope: 'workspace' },
  { commandId: 'workspace.open-trash', label: 'workspace.open-trash', defaultChord: 'Ctrl+Alt+T', customChord: null, scope: 'workspace' },
  { commandId: 'app.open-settings', label: 'app.open-settings', defaultChord: 'Ctrl+,', customChord: null, scope: 'app' },
]

// Accent presets store hue and chroma only; lightness is fixed per theme via the
// --accent-l token (src/styles/tokens.css: 0.50 light / 0.76 dark) so every
// preset keeps button, link, and focus contrast in both themes. Chroma is
// capped at 0.11 to stay within the muted, non-neon redesign palette.
export const ACCENT_PRESETS: Record<string, { accent: string; soft: string; glow: string }> = {
  mineral: { accent: 'oklch(var(--accent-l) 0.075 185)', soft: 'oklch(var(--accent-l) 0.075 185 / 0.14)', glow: 'oklch(var(--accent-l) 0.075 185 / 0.30)' },
  azure: { accent: 'oklch(var(--accent-l) 0.10 248)', soft: 'oklch(var(--accent-l) 0.10 248 / 0.14)', glow: 'oklch(var(--accent-l) 0.10 248 / 0.30)' },
  violet: { accent: 'oklch(var(--accent-l) 0.09 272)', soft: 'oklch(var(--accent-l) 0.09 272 / 0.14)', glow: 'oklch(var(--accent-l) 0.09 272 / 0.30)' },
  ember: { accent: 'oklch(var(--accent-l) 0.11 34)', soft: 'oklch(var(--accent-l) 0.11 34 / 0.14)', glow: 'oklch(var(--accent-l) 0.11 34 / 0.30)' },
  sage: { accent: 'oklch(var(--accent-l) 0.09 160)', soft: 'oklch(var(--accent-l) 0.09 160 / 0.14)', glow: 'oklch(var(--accent-l) 0.09 160 / 0.30)' },
  ocean: { accent: 'oklch(var(--accent-l) 0.10 220)', soft: 'oklch(var(--accent-l) 0.10 220 / 0.15)', glow: 'oklch(var(--accent-l) 0.10 220 / 0.30)' },
  rose: { accent: 'oklch(var(--accent-l) 0.11 12)', soft: 'oklch(var(--accent-l) 0.11 12 / 0.15)', glow: 'oklch(var(--accent-l) 0.11 12 / 0.30)' },
}

const EDITOR_FONT_PRESETS: Record<string, string> = {
  ui: 'var(--font-ui)',
  serif: 'var(--font-serif)',
  mono: 'var(--font-mono)',
}

/** @deprecated Use resolveEditorFontFamilyCss instead */
export const EDITOR_FONT_FAMILY_VARS = EDITOR_FONT_PRESETS

export function resolveEditorFontFamilyCss(fontFamily: string): string {
  return EDITOR_FONT_PRESETS[fontFamily] ?? `"${fontFamily}", var(--font-ui)`
}

export const EDITOR_LINE_WIDTHS = {
  narrow: '680px',
  medium: '760px',
  wide: '100%',
} as const

export function createDefaultAppConfig(): AppConfig {
  return {
    version: '1',
    theme: 'system',
    locale: 'ru',
    recents: [],
    interfaceDensity: 'comfortable',
    reducedMotion: 'system',
    scrollbarVisibility: 'hidden',
    focusRingStyle: 'accent',
    windowChromeStyle: 'default',
    interfaceZoom: 100,
    // `undefined` = off by default; set explicitly only when the user toggles it.
    reduceTransparency: undefined,
    interfaceRoundness: 'default',
    themeSchedule: { enabled: false, lightTime: '07:00', darkTime: '20:00' },
    onboarding: { tourStatus: 'pending', firstSteps: [], firstStepsHidden: false, seenHints: [], hintsEnabled: true },
  }
}

export function createDefaultWorkspaceSettings(): WorkspaceSettings {
  return {
    general: {
      defaultStartupView: 'editor',
      restoreLastContext: true,
      recentItemsBehavior: 'remember',
      confirmBeforeDelete: true,
      lastContext: { kind: 'workspace', folderId: null, noteId: null },
      startupNoteId: null,
      homeFavorites: [],
    },
    appearance: {
      accentPreset: 'mineral',
      backgroundScene: 'aurora',
      surfaceStyle: 'solid',
      contrastMode: 'balanced',
      sidebarStyle: 'floating',
      editorFontFamily: 'ui',
      editorFontSize: 16,
      editorLineWidth: 'medium',
      customCssEnabled: false,
      customCssFileName: 'custom.css',
      accentColoredHeadings: false,
    },
    editor: {
      spellCheck: false,
      markdownShortcuts: true,
      slashCommands: true,
      smoothScrolling: true,
      caretAnimation: 'system',
      tabKeyBehavior: 'indent',
      autosavePolicy: 'immediate',
      focusMode: 'off',
      typewriterScrolling: false,
      activeBlockEmphasis: false,
      pasteBehavior: 'smart',
      slashMenuHints: true,
      slashMenuLayout: 'list',
      editorStatsVisibility: 'off',
      typewriterPosition: 'lower',
    },
    workspace: {
      showBacklinksByDefault: true,
      showGraphLabels: false,
      folderCreateBehavior: 'current-folder',
      rootNotesVisible: true,
      defaultSort: 'updated-desc',
      description: '',
      workspaceType: 'general',
      status: 'active',
      tags: [],
      openLastVisitedSystemView: true,
      rememberExpandedFolders: true,
      sidebarDefaultState: 'expanded',
      newNotePlacement: 'current-folder',
      newFolderPlacement: 'current-folder',
      defaultChildSort: 'manual',
      showEmptyFolders: true,
      defaultNoteIcon: '📄',
      defaultNoteTitlePattern: 'untitled',
      defaultFolderIcon: '📁',
      newNoteTemplate: 'blank',
      newWorkspaceHomeNote: true,
      autoCreateStarterStructure: 'light',
      sidebarContentMode: 'tree',
      sidebarLayout: 'docked',
      sidebarSortMode: 'manual',
      graphEntryMode: 'global',
      graphScopeDefault: 'workspace',
      searchStartScope: 'workspace',
      historyDefaultRange: '30d',
    },
    ai: {
      enabled: false,
      privacyMode: true,
      defaultProvider: 'local',
      apiKind: 'ollama',
      defaultModel: 'llama3',
      baseUrl: 'http://localhost:11434',
      slashCommands: false,
      contextualSuggestions: false,
      streamingOutput: true,
      maxTokensPerRequest: 1024,
      cloudDailyBudgetUsd: 0,
    },
    plugins: {
      autoReloadOnLaunch: true,
      installSource: 'folder-only',
    },
    pluginSettings: {},
    features: {
      kanban: true,
      templates: true,
      vega: true,
      markmap: true,
    },
    mcp: {
      mode: 'off',
      autoSnapshot: true,
    },
    hotkeys: {
      bindings: DEFAULT_HOTKEY_BINDINGS.map(binding => ({ ...binding })),
    },
    files: {
      attachmentImportBehavior: 'copy-into-workspace',
      snapshotRetentionCount: 50,
      trashRetentionDays: 30,
    },
    advanced: {
      schemaVersion: 2,
      experimentalGraphTools: false,
      developerLogging: false,
    },
  }
}
