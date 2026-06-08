import type { HotkeyBinding } from '../types/workspace'
import { resolveBindingChord, getHotkeyConflictMap } from './workspace-settings'
import { normalizeHotkeyChord, toTauriShortcut } from './hotkey-chords'

export const HOTKEY_COMMAND_EVENT = 'nevo:shortcut-command'

export const GLOBAL_SHORTCUT_COMMAND_IDS = new Set([
  'workspace.new-note',
  'workspace.new-folder',
  'workspace.search',
  'workspace.toggle-sidebar',
  'app.open-settings',
])

export const LOCAL_SHORTCUT_COMMAND_IDS = new Set([
  ...GLOBAL_SHORTCUT_COMMAND_IDS,
  'workspace.save-note',
])

interface HotkeyCommandDetail {
  commandId: string
}

interface ParsedChord {
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
  key: string
}

const KEY_CODE_BY_TOKEN: Record<string, string> = {
  ',': 'Comma',
  '.': 'Period',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  ';': 'Semicolon',
  '\'': 'Quote',
  '`': 'Backquote',
  '\\': 'Backslash',
  '/': 'Slash',
  'Space': 'Space',
  'Enter': 'Enter',
  'Escape': 'Escape',
  'Tab': 'Tab',
}

function parseChord(chord: string | null | undefined): ParsedChord | null {
  const normalized = normalizeHotkeyChord(chord)
  if (!normalized) return null

  const tokens = normalized.split('+')
  const key = tokens[tokens.length - 1]
  if (!key) return null

  const modifiers = new Set(tokens.slice(0, -1))

  return {
    ctrl: modifiers.has('Ctrl'),
    alt: modifiers.has('Alt'),
    shift: modifiers.has('Shift'),
    meta: modifiers.has('Meta'),
    key,
  }
}

function keyTokenToEventCode(key: string): string | null {
  if (KEY_CODE_BY_TOKEN[key]) return KEY_CODE_BY_TOKEN[key]
  if (/^[A-Z]$/.test(key)) return `Key${key}`
  if (/^[0-9]$/.test(key)) return `Digit${key}`
  return null
}

export function getGlobalShortcutBindings(bindings: HotkeyBinding[]): Array<{ commandId: string; shortcut: string }> {
  const conflicts = getHotkeyConflictMap(bindings)
  const seen = new Set<string>()
  const result: Array<{ commandId: string; shortcut: string }> = []

  for (const binding of bindings) {
    if (!GLOBAL_SHORTCUT_COMMAND_IDS.has(binding.commandId)) continue
    if (conflicts[binding.commandId]?.length) continue

    const shortcut = toTauriShortcut(resolveBindingChord(binding))
    if (!shortcut) continue

    const key = shortcut.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    result.push({
      commandId: binding.commandId,
      shortcut,
    })
  }

  return result
}

export function matchHotkeyCommand(bindings: HotkeyBinding[], event: KeyboardEvent): string | null {
  if (event.repeat || event.isComposing) return null

  const conflicts = getHotkeyConflictMap(bindings)

  for (const binding of bindings) {
    if (!LOCAL_SHORTCUT_COMMAND_IDS.has(binding.commandId)) continue
    if (conflicts[binding.commandId]?.length) continue

    const chord = parseChord(resolveBindingChord(binding))
    if (!chord) continue

    if (event.ctrlKey !== chord.ctrl) continue
    if (event.altKey !== chord.alt) continue
    if (event.shiftKey !== chord.shift) continue
    if (event.metaKey !== chord.meta) continue

    const expectedCode = keyTokenToEventCode(chord.key)
    if (expectedCode) {
      if (event.code === expectedCode) return binding.commandId
      continue
    }

    if (event.key.toLowerCase() === chord.key.toLowerCase()) {
      return binding.commandId
    }
  }

  return null
}

export function dispatchHotkeyCommand(commandId: string) {
  window.dispatchEvent(new CustomEvent<HotkeyCommandDetail>(HOTKEY_COMMAND_EVENT, {
    detail: { commandId },
  }))
}

export function onHotkeyCommand(listener: (commandId: string) => void): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<HotkeyCommandDetail>).detail
    if (!detail?.commandId) return
    listener(detail.commandId)
  }

  window.addEventListener(HOTKEY_COMMAND_EVENT, handler)
  return () => window.removeEventListener(HOTKEY_COMMAND_EVENT, handler)
}
