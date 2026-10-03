import { describe, expect, it } from 'vitest'
import { pluralChoice } from './plural-index'

describe('pluralChoice', () => {
  it('resolves all three Russian plural forms', () => {
    expect(pluralChoice('ru', 1)).toBe(0)
    expect(pluralChoice('ru', 3)).toBe(1)
    expect(pluralChoice('ru', 7)).toBe(2)
    expect(pluralChoice('ru', 11)).toBe(2)
    expect(pluralChoice('ru', 22)).toBe(1)
  })

  it('resolves both forms for two-form locales, including zero', () => {
    expect(pluralChoice('en', 0)).toBe(2)
    expect(pluralChoice('en', 1)).toBe(1)
    expect(pluralChoice('en', 5)).toBe(2)
    expect(pluralChoice('de', 1)).toBe(1)
    expect(pluralChoice('de', 4)).toBe(2)
  })
})
