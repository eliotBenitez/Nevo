import type { PlatformKind } from './runtime'

/** Whether the primary shortcut modifier is ⌘ (Apple platforms) rather than Ctrl. */
export function usesCommandKey(
  platform: PlatformKind,
  navigatorPlatform: string = typeof navigator === 'undefined' ? '' : navigator.platform ?? '',
): boolean {
  if (platform === 'macos' || platform === 'ios') return true
  // The web/dev runtime has no Tauri metadata, so fall back to the browser's platform.
  if (platform === 'web') return /mac|iphone|ipad|ipod/i.test(navigatorPlatform)
  return false
}

export function formatModShortcut(key: string, useCommand: boolean): string {
  return useCommand ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`
}

export function isModShortcut(event: KeyboardEvent, key: string, useCommand: boolean): boolean {
  if (event.repeat || event.isComposing || event.altKey || event.shiftKey) return false
  const modifierHeld = useCommand
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey
  if (!modifierHeld) return false
  // `code` keeps the shortcut working on non-Latin keyboard layouts.
  return event.code === `Key${key.toUpperCase()}` || event.key.toLowerCase() === key.toLowerCase()
}
