import { describe, expect, it } from 'vitest'
import {
  createDefaultAppConfig,
  createDefaultWorkspaceSettings,
  getHotkeyConflictMap,
  normalizeAppConfig,
  normalizeWorkspaceSettings,
} from './workspace-settings'

describe('normalizeWorkspaceSettings', () => {
  it('migrates legacy flat keys into the nested schema', () => {
    const settings = normalizeWorkspaceSettings({
      defaultView: 'graph',
      editorFontSize: 19,
      editorLineWidth: 'wide',
      spellCheck: true,
    })

    expect(settings.general.defaultStartupView).toBe('graph')
    expect(settings.appearance.editorFontSize).toBe(19)
    expect(settings.appearance.editorLineWidth).toBe('wide')
    expect(settings.editor.spellCheck).toBe(true)
  })

  it('fills missing sections from defaults', () => {
    const defaults = createDefaultWorkspaceSettings()
    const settings = normalizeWorkspaceSettings({
      editor: {
        slashCommands: false,
      },
      files: {
        snapshotRetentionCount: 7,
      },
    })

    expect(settings.editor.slashCommands).toBe(false)
    expect(settings.editor.markdownShortcuts).toBe(defaults.editor.markdownShortcuts)
    expect(settings.files.snapshotRetentionCount).toBe(7)
    expect(settings.appearance.accentPreset).toBe(defaults.appearance.accentPreset)
    expect(settings.general.confirmBeforeDelete).toBe(defaults.general.confirmBeforeDelete)
    expect(settings.general.homeFavorites).toEqual([])
  })

  it('normalizes Home favorites while preserving the first valid occurrence and order', () => {
    const settings = normalizeWorkspaceSettings({
      general: {
        homeFavorites: [
          { kind: 'note', id: 'note-1' },
          { kind: 'unknown', id: 'ignored' },
          { kind: 'graph' },
          { kind: 'note', id: 'note-1' },
          { kind: 'folder', id: '  folder-1  ' },
          { kind: 'pluginView', pluginId: 'plugin.alpha', contributionId: 'dashboard' },
          { kind: 'pluginView', pluginId: '', contributionId: 'invalid' },
          { kind: 'board', id: 'board-1' },
          { kind: 'note', id: 'note-2' },
          { kind: 'note', id: 'note-3' },
          { kind: 'note', id: 'note-4' },
          { kind: 'note', id: 'note-5' },
        ],
      },
    })

    expect(settings.general.homeFavorites).toEqual([
      { kind: 'note', id: 'note-1' },
      { kind: 'graph' },
      { kind: 'folder', id: 'folder-1' },
      { kind: 'pluginView', pluginId: 'plugin.alpha', contributionId: 'dashboard' },
      { kind: 'board', id: 'board-1' },
      { kind: 'note', id: 'note-2' },
      { kind: 'note', id: 'note-3' },
      { kind: 'note', id: 'note-4' },
    ])
  })

  it('normalizes sidebarLayout to docked unless floating is explicitly set', () => {
    const defaults = createDefaultWorkspaceSettings()

    const invalid = normalizeWorkspaceSettings({ workspace: { sidebarLayout: 'not-a-mode' } })
    expect(invalid.workspace.sidebarLayout).toBe('docked')
    expect(invalid.workspace.sidebarLayout).toBe(defaults.workspace.sidebarLayout)

    const floating = normalizeWorkspaceSettings({ workspace: { sidebarLayout: 'floating' } })
    expect(floating.workspace.sidebarLayout).toBe('floating')
  })

  it('preserves supported slash menu layouts and defaults invalid values to list', () => {
    expect(createDefaultWorkspaceSettings().editor.slashMenuLayout).toBe('list')
    expect(normalizeWorkspaceSettings({ editor: { slashMenuLayout: 'grid' } }).editor.slashMenuLayout).toBe('grid')
    expect(normalizeWorkspaceSettings({ editor: { slashMenuLayout: 'preview' } }).editor.slashMenuLayout).toBe('preview')
    expect(normalizeWorkspaceSettings({ editor: { slashMenuLayout: 'tiles' } }).editor.slashMenuLayout).toBe('list')
    expect(normalizeWorkspaceSettings({}).editor.slashMenuLayout).toBe('list')
  })

  it('preserves arbitrary pluginSettings without dropping unknown keys', () => {
    const settings = normalizeWorkspaceSettings({
      pluginSettings: {
        'nevo.github-sync': {
          repo: 'owner/name',
          branch: 'main',
          autoSync: true,
          intervalMinutes: 15,
        },
      },
    })

    expect(settings.pluginSettings['nevo.github-sync']).toEqual({
      repo: 'owner/name',
      branch: 'main',
      autoSync: true,
      intervalMinutes: 15,
    })
  })

  it('defaults pluginSettings to an empty object when absent or invalid', () => {
    expect(normalizeWorkspaceSettings({}).pluginSettings).toEqual({})
    expect(normalizeWorkspaceSettings({ pluginSettings: [] }).pluginSettings).toEqual({})
    expect(normalizeWorkspaceSettings({ pluginSettings: 'nope' }).pluginSettings).toEqual({})
  })

  it('enables markdown shortcuts by default but preserves explicit opt-out', () => {
    expect(createDefaultWorkspaceSettings().editor.markdownShortcuts).toBe(true)
    expect(normalizeWorkspaceSettings({}).editor.markdownShortcuts).toBe(true)
    expect(normalizeWorkspaceSettings({ editor: { markdownShortcuts: false } }).editor.markdownShortcuts).toBe(false)
  })

  it('fills missing default hotkey bindings', () => {
    const settings = normalizeWorkspaceSettings({
      hotkeys: {
        bindings: [
          {
            commandId: 'workspace.new-note',
            label: 'Create note',
            defaultChord: 'Mod+N',
            customChord: 'Shift+mod+k',
            scope: 'workspace',
          },
        ],
      },
    })

    expect(settings.hotkeys.bindings.find(binding => binding.commandId === 'core.heading.6')?.defaultChord).toBe('Ctrl+Alt+6')
    expect(settings.hotkeys.bindings.find(binding => binding.commandId === 'core.math.inline.insert')?.defaultChord).toBe('Ctrl+M')
    expect(settings.hotkeys.bindings.find(binding => binding.commandId === 'workspace.save-note')?.defaultChord).toBe('Ctrl+S')
    expect(settings.hotkeys.bindings.find(binding => binding.commandId === 'workspace.toggle-sidebar')?.defaultChord).toBe('Ctrl+\\')
    expect(settings.hotkeys.bindings.find(binding => binding.commandId === 'workspace.toggle-right-panel')?.defaultChord).toBe('Ctrl+Alt+\\')
    expect(settings.hotkeys.bindings.find(binding => binding.commandId === 'workspace.open-graph')?.defaultChord).toBe('Ctrl+Alt+G')
    expect(settings.hotkeys.bindings.find(binding => binding.commandId === 'workspace.open-history')?.defaultChord).toBe('Ctrl+Alt+H')
    expect(settings.hotkeys.bindings.find(binding => binding.commandId === 'workspace.open-trash')?.defaultChord).toBe('Ctrl+Alt+T')
  })

  it('preserves custom note template ids and normalizes templates feature flag', () => {
    const settings = normalizeWorkspaceSettings({
      workspace: { newNoteTemplate: 'project-brief' },
      features: { templates: false },
    })

    expect(settings.workspace.newNoteTemplate).toBe('project-brief')
    expect(settings.features.templates).toBe(false)
  })

  it('defaults appearance to accent mineral and surface solid (Borderless is the only style)', () => {
    const settings = normalizeWorkspaceSettings({})

    expect(settings.appearance.accentPreset).toBe('mineral')
    expect(settings.appearance.surfaceStyle).toBe('solid')
  })

  it('preserves legacy surfaceStyle values glass, solid, and tinted through a round trip', () => {
    expect(normalizeWorkspaceSettings({ appearance: { surfaceStyle: 'glass' } }).appearance.surfaceStyle).toBe('glass')
    expect(normalizeWorkspaceSettings({ appearance: { surfaceStyle: 'solid' } }).appearance.surfaceStyle).toBe('solid')
    expect(normalizeWorkspaceSettings({ appearance: { surfaceStyle: 'tinted' } }).appearance.surfaceStyle).toBe('tinted')
  })

  it('falls back to solid for a missing or invalid surfaceStyle', () => {
    expect(normalizeWorkspaceSettings({ appearance: {} }).appearance.surfaceStyle).toBe('solid')
    expect(normalizeWorkspaceSettings({ appearance: { surfaceStyle: 'not-a-style' } }).appearance.surfaceStyle).toBe('solid')
  })
})

describe('getHotkeyConflictMap', () => {
  it('reports duplicate resolved chords', () => {
    const settings = createDefaultWorkspaceSettings()
    settings.hotkeys.bindings[0].customChord = 'Ctrl+K'
    settings.hotkeys.bindings[1].customChord = 'mod+k'

    const conflicts = getHotkeyConflictMap(settings.hotkeys.bindings)

    expect(conflicts['core.undo']).toContain('core.redo')
    expect(conflicts['core.redo']).toContain('core.undo')
  })

  it('normalizes legacy Mod bindings to Ctrl display', () => {
    const settings = normalizeWorkspaceSettings({
      hotkeys: {
        bindings: [
          {
            commandId: 'workspace.new-note',
            label: 'Create note',
            defaultChord: 'Mod+N',
            customChord: 'Shift+mod+k',
            scope: 'workspace',
          },
        ],
      },
    })

    expect(settings.hotkeys.bindings.find(binding => binding.commandId === 'workspace.new-note')?.defaultChord).toBe('Ctrl+N')
    expect(settings.hotkeys.bindings.find(binding => binding.commandId === 'workspace.new-note')?.customChord).toBe('Ctrl+Shift+K')
  })

  it('preserves accentColoredHeadings appearance setting across normalization', () => {
    expect(createDefaultWorkspaceSettings().appearance.accentColoredHeadings).toBe(false)
    expect(normalizeWorkspaceSettings({ appearance: { accentColoredHeadings: true } }).appearance.accentColoredHeadings).toBe(true)
    expect(normalizeWorkspaceSettings({ appearance: { accentColoredHeadings: false } }).appearance.accentColoredHeadings).toBe(false)
    expect(normalizeWorkspaceSettings({ editor: { accentColoredHeadings: true } as any }).appearance.accentColoredHeadings).toBe(true)
    expect(normalizeWorkspaceSettings({ accentColoredHeadings: true } as any).appearance.accentColoredHeadings).toBe(true)
    expect(normalizeWorkspaceSettings({}).appearance.accentColoredHeadings).toBe(false)
  })
})

describe('normalizeAppConfig', () => {
  it('fills locale from defaults when missing', () => {
    const defaults = createDefaultAppConfig()

    expect(normalizeAppConfig({ version: '1', theme: 'dark', recents: [] }).locale).toBe(defaults.locale)
  })

  it('preserves supported locales', () => {
    expect(normalizeAppConfig({ locale: 'en' }).locale).toBe('en')
    expect(normalizeAppConfig({ locale: 'ru' }).locale).toBe('ru')
  })

  it('normalizes the notebook palette and leaves it undefined when absent', () => {
    expect(normalizeAppConfig({}).notebookPalette).toBeUndefined()
    expect(normalizeAppConfig({ notebookPalette: 'nope' }).notebookPalette).toBeUndefined()
    expect(normalizeAppConfig({
      notebookPalette: { presets: ['#ABCDEF', '#abcdef', 'zzzzzz', '#000000'], recents: ['#FFF', 3] },
    } as never).notebookPalette).toEqual({ presets: ['#abcdef'], recents: ['#ffffff'] })
  })

  it('keeps remembered notebook tool settings and drops invalid ones', () => {
    expect(normalizeAppConfig({}).notebookTools).toBeUndefined()
    expect(normalizeAppConfig({
      notebookTools: { penColor: '#1D4ED8', markerColor: 'nope', strokeWidth: 2, markerWidth: 99 },
    } as never).notebookTools).toEqual({ penColor: '#1d4ed8', strokeWidth: 2 })
  })

  it('drops legacy cloud/shared-storage recents entries', () => {
    const recents = [
      { id: 'local-1', name: 'Local', glyph: '📁', gradient: 'a', path: '/home/user/ws', lastOpened: '2024-01-01T00:00:00Z', pageCount: 3 },
      { id: 'cloud-1', name: 'Cloud kind', glyph: '☁️', gradient: 'b', path: 'cloud:cloud-1', lastOpened: '2024-01-02T00:00:00Z', pageCount: 0, kind: 'cloud', storageId: 'cloud-1', serverUrl: 'https://relay.example' },
      { id: 'cloud-2', name: 'Storage id only', glyph: '☁️', gradient: 'c', path: '/tmp/does-not-matter', lastOpened: '2024-01-03T00:00:00Z', pageCount: 0, storageId: 'cloud-2' },
      { id: 'cloud-3', name: 'Cloud path prefix', glyph: '☁️', gradient: 'd', path: 'cloud:cloud-3', lastOpened: '2024-01-04T00:00:00Z', pageCount: 0 },
    ]

    const result = normalizeAppConfig({ recents })

    expect(result.recents).toHaveLength(1)
    expect(result.recents[0].id).toBe('local-1')
    expect(result.recents[0]).not.toHaveProperty('kind')
    expect(result.recents[0]).not.toHaveProperty('storageId')
    expect(result.recents[0]).not.toHaveProperty('serverUrl')
  })

  const recent = { id: 'local-1', name: 'Local', glyph: '📁', gradient: 'a', path: '/home/user/ws', lastOpened: '2024-01-01T00:00:00Z', pageCount: 3 }

  it('defaults onboarding to pending for a fresh install (no onboarding field, no recents)', () => {
    const result = normalizeAppConfig({})

    expect(result.onboarding).toEqual({ tourStatus: 'pending', firstSteps: [], firstStepsHidden: false, seenHints: [], hintsEnabled: true })
  })

  it('treats a missing onboarding field with existing recents as an already-onboarded user', () => {
    const result = normalizeAppConfig({ recents: [recent] })

    expect(result.onboarding).toEqual({ tourStatus: 'dismissed', firstSteps: [], firstStepsHidden: true, seenHints: [], hintsEnabled: true })
  })

  it('treats an invalid onboarding field the same as a missing one, based on recents', () => {
    expect(normalizeAppConfig({ onboarding: 'nope' }).onboarding).toEqual({ tourStatus: 'pending', firstSteps: [], firstStepsHidden: false, seenHints: [], hintsEnabled: true })
    expect(normalizeAppConfig({ onboarding: 'nope', recents: [recent] }).onboarding).toEqual({ tourStatus: 'dismissed', firstSteps: [], firstStepsHidden: true, seenHints: [], hintsEnabled: true })
  })

  it('falls back an unknown tourStatus to dismissed/pending based on recents, independent of other fields', () => {
    expect(normalizeAppConfig({ onboarding: { tourStatus: 'not-a-status', firstSteps: [], firstStepsHidden: false } }).onboarding.tourStatus).toBe('pending')
    expect(normalizeAppConfig({ onboarding: { tourStatus: 'not-a-status', firstSteps: [], firstStepsHidden: false }, recents: [recent] }).onboarding.tourStatus).toBe('dismissed')
  })

  it('preserves a valid onboarding state and filters/dedupes unknown firstSteps ids', () => {
    const result = normalizeAppConfig({
      onboarding: {
        tourStatus: 'completed',
        firstSteps: ['insertBlock', 'unknownStep', 'openGraph', 'insertBlock'],
        firstStepsHidden: true,
      },
    })

    expect(result.onboarding.tourStatus).toBe('completed')
    expect(result.onboarding.firstSteps).toEqual(['insertBlock', 'openGraph'])
    expect(result.onboarding.firstStepsHidden).toBe(true)
  })

  it('round-trips onboarding through normalizeAppConfig unchanged', () => {
    const onboarding = {
      tourStatus: 'completed' as const,
      firstSteps: ['createWorkspace' as const, 'takeTour' as const],
      firstStepsHidden: true,
      seenHints: ['editorCanvas' as const, 'graphFilters' as const],
      hintsEnabled: true,
    }
    const result = normalizeAppConfig({ onboarding })

    expect(result.onboarding).toEqual(onboarding)
  })

  it('defaults seenHints to empty and hintsEnabled to true when absent', () => {
    const result = normalizeAppConfig({ onboarding: { tourStatus: 'completed', firstSteps: [], firstStepsHidden: true } })

    expect(result.onboarding.seenHints).toEqual([])
    expect(result.onboarding.hintsEnabled).toBe(true)
  })

  it('filters unknown hint ids and dedupes into canonical order', () => {
    const result = normalizeAppConfig({
      onboarding: {
        tourStatus: 'completed',
        firstSteps: [],
        firstStepsHidden: true,
        seenHints: ['canvasPresent', 'unknownHint', 'editorCanvas', 'canvasPresent'],
      },
    })

    expect(result.onboarding.seenHints).toEqual(['editorCanvas', 'canvasPresent'])
  })

  it('only an explicit false disables hints; anything else falls back to enabled', () => {
    expect(normalizeAppConfig({ onboarding: { tourStatus: 'completed', firstSteps: [], firstStepsHidden: true, hintsEnabled: false } }).onboarding.hintsEnabled).toBe(false)
    expect(normalizeAppConfig({ onboarding: { tourStatus: 'completed', firstSteps: [], firstStepsHidden: true, hintsEnabled: 'nope' } }).onboarding.hintsEnabled).toBe(true)
  })
})
