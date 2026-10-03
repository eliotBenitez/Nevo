import { describe, expect, it } from 'vitest'
import en from './en.json'
import ru from './ru.json'
import fr from './fr.json'
import es from './es.json'
import de from './de.json'

const localeMessages = [
  ['en', en],
  ['ru', ru],
  ['fr', fr],
  ['es', es],
  ['de', de],
] as const

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
}

describe('locale messages', () => {
  const referenceKeys = flattenKeys(en).sort()

  it.each([
    ['ru', ru],
    ['fr', fr],
    ['es', es],
    ['de', de],
  ] as const)('keeps %s message keys in sync with English', (_locale, messages) => {
    expect(flattenKeys(messages).sort()).toEqual(referenceKeys)
  })

  it.each(localeMessages)('defines query result field labels in %s', (_locale, messages) => {
    expect(messages.editor.queryBlock.fields).toEqual({
      title: expect.any(String),
      tags: expect.any(String),
      status: expect.any(String),
      type: expect.any(String),
      date: expect.any(String),
      folder: expect.any(String),
    })
  })

  it('defines concise single-word search labels for all locales', () => {
    expect(ru.workspace.titlebarSearch.placeholder).toBe('Поиск')
    expect(ru.workspace.home.search).toBe('Поиск')
    expect(en.workspace.titlebarSearch.placeholder).toBe('Search')
    expect(en.workspace.home.search).toBe('Search')
    expect(de.workspace.titlebarSearch.placeholder).toBe('Suchen')
    expect(de.workspace.home.search).toBe('Suchen')
    expect(es.workspace.titlebarSearch.placeholder).toBe('Buscar')
    expect(es.workspace.home.search).toBe('Buscar')
    expect(fr.workspace.titlebarSearch.placeholder).toBe('Rechercher')
    expect(fr.workspace.home.search).toBe('Rechercher')
  })
})
