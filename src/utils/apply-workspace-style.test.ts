import { afterEach, describe, expect, it } from 'vitest'
import { applyWorkspaceStyle } from './apply-workspace-style'
import { createDefaultWorkspaceSettings } from './workspace-settings'

describe('applyWorkspaceStyle', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-scene')
    document.documentElement.removeAttribute('data-surface')
    document.documentElement.removeAttribute('data-contrast')
    document.documentElement.removeAttribute('data-sidebar')
    document.documentElement.style.removeProperty('--accent')
    document.documentElement.style.removeProperty('--accent-hover')
    document.documentElement.style.removeProperty('--accent-soft')
    document.documentElement.style.removeProperty('--accent-glow')
    document.documentElement.style.removeProperty('--selection')
  })

  it('applies preset accent tokens globally for teleported settings UI', () => {
    const appearance = createDefaultWorkspaceSettings().appearance

    applyWorkspaceStyle({ ...appearance, accentPreset: 'ocean' })

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('oklch(0.69 0.10 220)')
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toBe('oklch(0.69 0.10 220 / 0.15)')
    expect(document.documentElement.style.getPropertyValue('--accent-glow')).toBe('oklch(0.69 0.10 220 / 0.30)')
    expect(document.documentElement.style.getPropertyValue('--selection')).toBe('color-mix(in oklab, oklch(0.69 0.10 220) 25%, transparent)')
  })

  it('derives global accent tokens from a custom accent color', () => {
    const appearance = createDefaultWorkspaceSettings().appearance

    applyWorkspaceStyle({ ...appearance, accentPreset: '#2f80ed' })

    expect(document.documentElement.style.getPropertyValue('--accent')).toBe('#2f80ed')
    expect(document.documentElement.style.getPropertyValue('--accent-soft')).toBe('color-mix(in oklab, #2f80ed 14%, transparent)')
    expect(document.documentElement.style.getPropertyValue('--accent-glow')).toBe('color-mix(in oklab, #2f80ed 32%, transparent)')
  })
})
