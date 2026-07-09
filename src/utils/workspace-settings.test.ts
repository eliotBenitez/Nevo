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
    expect(settings.workspace.defaultLandingView).toBe('graph')
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
})
