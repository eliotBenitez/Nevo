import type { AppearanceSettings } from '../types/workspace'
import { ACCENT_PRESETS } from './workspace-settings'

function resolveAccentTokens(value: string) {
  const preset = ACCENT_PRESETS[value]
  if (preset) return preset

  return {
    accent: value,
    soft: `color-mix(in oklab, ${value} 14%, transparent)`,
    glow: `color-mix(in oklab, ${value} 32%, transparent)`,
  }
}

export function applyWorkspaceStyle(appearance: AppearanceSettings): void {
  const el = document.documentElement
  const accent = resolveAccentTokens(appearance.accentPreset)

  el.style.setProperty('--accent', accent.accent)
  el.style.setProperty('--accent-hover', `color-mix(in oklab, ${accent.accent} 88%, white)`)
  el.style.setProperty('--accent-soft', accent.soft)
  el.style.setProperty('--accent-glow', accent.glow)
  el.style.setProperty('--selection', `color-mix(in oklab, ${accent.accent} 25%, transparent)`)
  el.setAttribute('data-scene', appearance.backgroundScene)
  el.setAttribute('data-surface', appearance.surfaceStyle)
  el.setAttribute('data-contrast', appearance.contrastMode)
  el.setAttribute('data-sidebar', appearance.sidebarStyle)
}
