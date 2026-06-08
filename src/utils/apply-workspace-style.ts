import type { AppearanceSettings } from '../types/workspace'

export function applyWorkspaceStyle(appearance: AppearanceSettings): void {
  const el = document.documentElement
  el.setAttribute('data-scene', appearance.backgroundScene)
  el.setAttribute('data-surface', appearance.surfaceStyle)
  el.setAttribute('data-contrast', appearance.contrastMode)
  el.setAttribute('data-sidebar', appearance.sidebarStyle)
}
