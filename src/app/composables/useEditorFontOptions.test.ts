import { describe, expect, it } from 'vitest'
import { buildEditorFontOptions } from './useEditorFontOptions'

describe('buildEditorFontOptions', () => {
  it('lists presets first, then system fonts', () => {
    const options = buildEditorFontOptions(['Arial', 'Segoe UI'])
    expect(options.map(option => option.value)).toEqual(['ui', 'serif', 'mono', 'Arial', 'Segoe UI'])
    expect(options[3]).toMatchObject({ label: 'Arial' })
  })

  it('skips system fonts that collide with preset ids', () => {
    const options = buildEditorFontOptions(['mono', 'Calibri'])
    expect(options.filter(option => option.value === 'mono')).toHaveLength(1)
    expect(options.at(-1)?.value).toBe('Calibri')
  })

  it('falls back to presets when no system fonts are available', () => {
    expect(buildEditorFontOptions([]).map(option => option.value)).toEqual(['ui', 'serif', 'mono'])
  })
})
