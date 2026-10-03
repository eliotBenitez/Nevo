import { describe, expect, it } from 'vitest'
import { createDefaultWorkspaceSettings } from './workspace-settings'
import { getGlobalShortcutBindings, matchHotkeyCommand } from './hotkeys'

describe('matchHotkeyCommand', () => {
  it('matches punctuation shortcuts by physical key code', () => {
    const bindings = createDefaultWorkspaceSettings().hotkeys.bindings
    const event = new KeyboardEvent('keydown', {
      ctrlKey: true,
      key: 'б',
      code: 'Comma',
    })

    expect(matchHotkeyCommand(bindings, event)).toBe('app.open-settings')
  })

  it('matches letter shortcuts by physical key code across layouts', () => {
    const bindings = createDefaultWorkspaceSettings().hotkeys.bindings
    const event = new KeyboardEvent('keydown', {
      ctrlKey: true,
      key: 'з',
      code: 'KeyP',
    })

    expect(matchHotkeyCommand(bindings, event)).toBe('workspace.search')
  })

  it('matches save as a local shortcut only', () => {
    const bindings = createDefaultWorkspaceSettings().hotkeys.bindings
    const event = new KeyboardEvent('keydown', {
      ctrlKey: true,
      key: 'ы',
      code: 'KeyS',
    })

    expect(matchHotkeyCommand(bindings, event)).toBe('workspace.save-note')
    expect(getGlobalShortcutBindings(bindings).map(binding => binding.commandId)).not.toContain('workspace.save-note')
  })

  it('resolves Ctrl+F to find-in-note and Ctrl+H to replace-in-note, both local-only', () => {
    const bindings = createDefaultWorkspaceSettings().hotkeys.bindings
    const findEvent = new KeyboardEvent('keydown', { ctrlKey: true, key: 'a', code: 'KeyF' })
    const replaceEvent = new KeyboardEvent('keydown', { ctrlKey: true, key: 'r', code: 'KeyH' })

    expect(matchHotkeyCommand(bindings, findEvent)).toBe('editor.find-in-note')
    expect(matchHotkeyCommand(bindings, replaceEvent)).toBe('editor.replace-in-note')
    const globalCommandIds = getGlobalShortcutBindings(bindings).map(binding => binding.commandId)
    expect(globalCommandIds).not.toContain('editor.find-in-note')
    expect(globalCommandIds).not.toContain('editor.replace-in-note')
  })
})
