import { afterEach, describe, expect, it } from 'vitest'
import { applyAppLocale, i18n } from './i18n'

afterEach(() => {
  applyAppLocale('ru')
})

describe('applyAppLocale', () => {
  it('updates i18n and document language', () => {
    applyAppLocale('en')

    expect(i18n.global.locale.value).toBe('en')
    expect(document.documentElement.lang).toBe('en')

    applyAppLocale('ru')

    expect(i18n.global.locale.value).toBe('ru')
    expect(document.documentElement.lang).toBe('ru')
  })
})
