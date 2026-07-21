import { describe, expect, it } from 'vitest'
import en from './en.json'
import ru from './ru.json'
import fr from './fr.json'
import es from './es.json'
import de from './de.json'

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
})
