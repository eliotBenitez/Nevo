import { describe, expect, it } from 'vitest'
import {
  NOTEBOOK_TOOL_DEFAULTS,
  normalizeNotebookToolPreferences,
  resolveNotebookToolSettings,
} from './toolPreferences'

describe('notebook tool preferences', () => {
  it('keeps valid colors and in-range widths', () => {
    expect(normalizeNotebookToolPreferences({
      penColor: '#1D4ED8', markerColor: '#0EA5E9', strokeWidth: 2.25, markerWidth: 18,
    })).toEqual({ penColor: '#1d4ed8', markerColor: '#0ea5e9', strokeWidth: 2.25, markerWidth: 18 })
  })

  it('drops invalid colors and widths outside the toolbar ranges', () => {
    expect(normalizeNotebookToolPreferences({
      penColor: 'blue', markerColor: 7, strokeWidth: 9, markerWidth: 1.5,
    })).toEqual({})
    expect(normalizeNotebookToolPreferences({ strokeWidth: Number.NaN, markerWidth: '12' })).toEqual({})
    expect(normalizeNotebookToolPreferences({ strokeWidth: 0.25, markerWidth: 24 })).toEqual({ strokeWidth: 0.25, markerWidth: 24 })
  })

  it('ignores a stabilizer level left in configs from the removed pen stabilizer', () => {
    expect(normalizeNotebookToolPreferences({ stabilizer: 'high', strokeWidth: 2 })).toEqual({ strokeWidth: 2 })
  })

  it('returns undefined for a missing or non-object value', () => {
    expect(normalizeNotebookToolPreferences(undefined)).toBeUndefined()
    expect(normalizeNotebookToolPreferences('x')).toBeUndefined()
    expect(normalizeNotebookToolPreferences([])).toBeUndefined()
  })

  it('fills defaults for anything never changed', () => {
    expect(resolveNotebookToolSettings(undefined)).toEqual(NOTEBOOK_TOOL_DEFAULTS)
    expect(resolveNotebookToolSettings({ markerWidth: 20, penColor: 'nope' })).toEqual({ ...NOTEBOOK_TOOL_DEFAULTS, markerWidth: 20 })
  })
})
