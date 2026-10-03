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
  el.style.setProperty('--accent-hover', `color-mix(in oklab, ${accent.accent} 88%, var(--accent-hover-toward))`)
  el.style.setProperty('--accent-soft', accent.soft)
  el.style.setProperty('--selection', `color-mix(in oklab, ${accent.accent} 25%, transparent)`)
  // Borderless is the only style now; surfaceStyle/backgroundScene/sidebarStyle are
  // preserved in persisted settings but ignored for rendering — see the redesign spec §9.
  el.setAttribute('data-contrast', appearance.contrastMode)
}
