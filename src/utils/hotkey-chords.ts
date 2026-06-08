const MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const

function normalizeHotkeyToken(segment: string): string | null {
  const value = segment.trim()
  if (!value) return null

  const lower = value.toLowerCase()

  if (['mod', 'ctrl', 'control', 'cmdorcontrol', 'cmdorctrl', 'commandorcontrol'].includes(lower)) {
    return 'Ctrl'
  }
  if (['alt', 'option'].includes(lower)) {
    return 'Alt'
  }
  if (lower === 'shift') {
    return 'Shift'
  }
  if (['meta', 'cmd', 'command', 'super'].includes(lower)) {
    return 'Meta'
  }
  if (lower === 'spacebar' || lower === 'space') {
    return 'Space'
  }
  if (lower === 'esc') {
    return 'Escape'
  }
  if (lower === 'return') {
    return 'Enter'
  }
  if (value.length === 1) {
    return value.toUpperCase()
  }

  return value[0].toUpperCase() + value.slice(1)
}

export function normalizeHotkeyChord(chord: string | null | undefined): string | null {
  if (!chord?.trim()) return null

  const modifiers = new Set<string>()
  let key: string | null = null

  for (const segment of chord.split('+')) {
    const token = normalizeHotkeyToken(segment)
    if (!token) continue

    if (MODIFIER_ORDER.includes(token as typeof MODIFIER_ORDER[number])) {
      modifiers.add(token)
      continue
    }

    key = token
  }

  if (!key) return null

  const parts: string[] = MODIFIER_ORDER.filter(modifier => modifiers.has(modifier))
  parts.push(key)
  return parts.join('+')
}

export function getHotkeyConflictKey(chord: string | null | undefined): string | null {
  return normalizeHotkeyChord(chord)?.toLowerCase() ?? null
}

export function toTauriShortcut(chord: string | null | undefined): string | null {
  return normalizeHotkeyChord(chord)
}
