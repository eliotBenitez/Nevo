import type { HotkeyBinding, WorkspaceSettings } from '../../types/workspace'
import { getHotkeyConflictKey } from '../hotkey-chords'

export { ACCENT_PRESETS, EDITOR_FONT_FAMILY_VARS, EDITOR_LINE_WIDTHS, resolveEditorFontFamilyCss, createDefaultAppConfig, createDefaultWorkspaceSettings } from './defaults'
export { normalizeWorkspaceSettings, normalizeAppConfig, normalizeHotkeyBindings } from './normalizers'

export function cloneWorkspaceSettings(settings: WorkspaceSettings): WorkspaceSettings {
  // structuredClone is faster than a JSON round-trip; settings is plain data.
  return structuredClone(settings)
}

export function resolveBindingChord(binding: HotkeyBinding): string {
  return binding.customChord?.trim() || binding.defaultChord
}

export function getHotkeyConflictMap(bindings: HotkeyBinding[]): Record<string, string[]> {
  const bucket = new Map<string, string[]>()
  for (const binding of bindings) {
    const chord = getHotkeyConflictKey(resolveBindingChord(binding))
    if (!chord) continue
    const existing = bucket.get(chord) ?? []
    existing.push(binding.commandId)
    bucket.set(chord, existing)
  }

  const conflicts: Record<string, string[]> = {}
  for (const ids of bucket.values()) {
    if (ids.length < 2) continue
    for (const id of ids) {
      conflicts[id] = ids.filter(other => other !== id)
    }
  }

  return conflicts
}
