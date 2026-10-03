import { afterEach, describe, expect, it } from 'vitest'
import { i18n } from '../../../i18n'
import type { NevoSlashItem } from '../../../types/editor-plugin'
import { getSlashSearchTerms } from './slashSearchTerms'

describe('getSlashSearchTerms', () => {
  const originalLocale = i18n.global.locale.value

  afterEach(() => {
    i18n.global.locale.value = originalLocale
  })

  it('returns the current locale title across registered catalogs', () => {
    const heading: NevoSlashItem = { id: 'h1', title: 'Heading 1', run: () => {} }
    const terms = [
      ['ru', 'Заголовок 1'],
      ['fr', 'Titre 1'],
      ['de', 'Überschrift 1'],
    ] as const

    for (const [locale, title] of terms) {
      i18n.global.locale.value = locale
      expect(getSlashSearchTerms(heading)).toEqual([title])
    }
  })

  it('returns no localized term when the catalog key is absent', () => {
    i18n.global.locale.value = 'ru'
    expect(getSlashSearchTerms({ id: 'plugin-owned-title', title: 'Custom fallback', run: () => {} })).toEqual([])
  })
})
