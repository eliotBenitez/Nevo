import { afterEach, describe, expect, it } from 'vitest'
import { applyWorkspaceStyle } from './apply-workspace-style'
import { createDefaultWorkspaceSettings } from './workspace-settings'

describe('applyWorkspaceStyle', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-contrast')
    document.documentElement.style.removeProperty('--accent')
    document.documentElement.style.removeProperty('--accent-hover')
    document.documentElement.style.removeProperty('--accent-soft')
    document.documentElement.style.removeProperty('--accent-glow')
    document.documentElement.style.removeProperty('--selection')
  })

  it('applies preset accent tokens globally for teleported settings UI', () => {
    const appearance = createDefaultWorkspaceSettings().appearance

    applyWorkspaceStyle({ ...appearance, accentPreset: 'ocean' })

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('oklch(var(--accent-l) 0.10 220)')
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toBe('color-mix(in oklab, oklch(var(--accent-l) 0.10 220) 88%, var(--accent-hover-toward))')
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toBe('oklch(var(--accent-l) 0.10 220 / 0.15)')
    // Glow tokens are deprecated (borderless design): no inline glow is written.
    expect(document.documentElement.style.getPropertyValue('--accent-glow')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--selection')).toBe('color-mix(in oklab, oklch(var(--accent-l) 0.10 220) 25%, transparent)')
  })

  it('derives global accent tokens from a custom accent color', () => {
    const appearance = createDefaultWorkspaceSettings().appearance

    applyWorkspaceStyle({ ...appearance, accentPreset: '#2f80ed' })

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2f80ed')
    expect(document.documentElement.style.getPropertyValue('--accent-hover')).toBe('color-mix(in oklab, #2f80ed 88%, var(--accent-hover-toward))')
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toBe('color-mix(in oklab, #2f80ed 14%, transparent)')
    expect(document.documentElement.style.getPropertyValue('--accent-glow')).toBe('')
  })

  it('always sets data-contrast and no longer emits data-scene/data-surface/data-sidebar', () => {
    const appearance = createDefaultWorkspaceSettings().appearance

    applyWorkspaceStyle({
      ...appearance,
      surfaceStyle: 'glass',
      backgroundScene: 'aurora',
      sidebarStyle: 'floating',
    })

    expect(document.documentElement.getAttribute('data-contrast')).toBe(appearance.contrastMode)
    expect(document.documentElement.hasAttribute('data-surface')).toBe(false)
    expect(document.documentElement.hasAttribute('data-scene')).toBe(false)
    expect(document.documentElement.hasAttribute('data-sidebar')).toBe(false)
  })
})
