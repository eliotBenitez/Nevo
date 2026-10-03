import { describe, expect, it } from 'vitest'
import { formatModShortcut, isModShortcut, usesCommandKey } from './modShortcut'

function keydown(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', init)
}

describe('modShortcut', () => {
  it('uses ⌘ only on Apple platforms', () => {
    expect(usesCommandKey('macos')).toBe(true)
    expect(usesCommandKey('ios')).toBe(true)
    expect(usesCommandKey('linux', 'MacIntel')).toBe(false)
    expect(usesCommandKey('windows')).toBe(false)
    expect(usesCommandKey('web', 'MacIntel')).toBe(true)
    expect(usesCommandKey('web', 'Linux x86_64')).toBe(false)
  })

  it('formats the platform modifier label', () => {
    expect(formatModShortcut('o', true)).toBe('⌘O')
    expect(formatModShortcut('o', false)).toBe('Ctrl+O')
  })

  it('matches only the platform modifier, including non-Latin layouts', () => {
    expect(isModShortcut(keydown({ key: 'o', code: 'KeyO', ctrlKey: true }), 'O', false)).toBe(true)
    expect(isModShortcut(keydown({ key: 'щ', code: 'KeyO', ctrlKey: true }), 'O', false)).toBe(true)
    expect(isModShortcut(keydown({ key: 'o', code: 'KeyO', metaKey: true }), 'O', false)).toBe(false)
    expect(isModShortcut(keydown({ key: 'o', code: 'KeyO', metaKey: true }), 'O', true)).toBe(true)
    expect(isModShortcut(keydown({ key: 'o', code: 'KeyO', ctrlKey: true, shiftKey: true }), 'O', false)).toBe(false)
    expect(isModShortcut(keydown({ key: 'o', code: 'KeyO' }), 'O', false)).toBe(false)
  })
})
