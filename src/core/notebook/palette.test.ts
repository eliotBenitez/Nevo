import { describe, expect, it } from 'vitest'
import {
  NOTEBOOK_BUILTIN_COLORS,
  addPresetColor,
  isBuiltinNotebookColor,
  normalizeNotebookPalette,
  notebookBuiltinColorName,
  pushRecentColor,
  removePresetColor,
} from './palette'

describe('notebook palette', () => {
  it('exposes twelve builtin colors with names', () => {
    expect(NOTEBOOK_BUILTIN_COLORS).toHaveLength(12)
    expect(notebookBuiltinColorName('#F0C419')).toBe('yellow')
    expect(notebookBuiltinColorName('#123456')).toBeNull()
    expect(isBuiltinNotebookColor('#000')).toBe(true)
  })

  it('pushes recents to the front, dedupes and caps at 8', () => {
    let list: string[] = []
    for (let i = 0; i < 10; i++) list = pushRecentColor(list, `#0000${i.toString(16).padStart(2, '0')}`)
    expect(list).toHaveLength(8)
    expect(list[0]).toBe('#000009')
    expect(pushRecentColor(['#111111', '#222222'], '#222222')).toEqual(['#222222', '#111111'])
    expect(pushRecentColor(['#111111'], 'nope')).toEqual(['#111111'])
  })

  it('adds presets without builtin colors, duplicates, or beyond 24', () => {
    expect(addPresetColor([], '#123456')).toEqual(['#123456'])
    expect(addPresetColor(['#123456'], '#123456')).toEqual(['#123456'])
    expect(addPresetColor([], '#000000')).toEqual([])
    let list: string[] = []
    for (let i = 0; i < 30; i++) list = addPresetColor(list, `#1000${i.toString(16).padStart(2, '0')}`)
    expect(list).toHaveLength(24)
  })

  it('removes presets', () => {
    expect(removePresetColor(['#111111', '#222222'], '#111111')).toEqual(['#222222'])
  })

  it('normalizes garbage', () => {
    expect(normalizeNotebookPalette(undefined)).toBeUndefined()
    expect(normalizeNotebookPalette('x')).toBeUndefined()
    expect(normalizeNotebookPalette([])).toBeUndefined()
    expect(normalizeNotebookPalette({})).toEqual({ presets: [], recents: [] })
    expect(normalizeNotebookPalette({
      presets: ['#ABCDEF', '#abcdef', 'zzzzzz', 5, '#000000', '#123'],
      recents: ['#FFFFFF', '#ffffff', null, '#000000'],
    })).toEqual({ presets: ['#abcdef', '#112233'], recents: ['#ffffff', '#000000'] })
  })
})
