import { describe, expect, it } from 'vitest'
import { resolveDictationLanguage } from './transcriptionLanguage'

describe('resolveDictationLanguage', () => {
  it('keeps an explicit language', () => {
    expect(resolveDictationLanguage('en', 'ru')).toBe('en')
  })

  it('maps auto to a supported interface language', () => {
    expect(resolveDictationLanguage('auto', 'ru')).toBe('ru')
    expect(resolveDictationLanguage('auto', 'de')).toBe('de')
  })

  it('stays auto for an unsupported interface language', () => {
    expect(resolveDictationLanguage('auto', 'ja')).toBe('auto')
  })
})
