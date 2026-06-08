import { describe, expect, it } from 'vitest'
import en from './en.json'
import ru from './ru.json'

function flattenKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key))
}

describe('locale messages', () => {
  it('keeps English and Russian message keys in sync', () => {
    expect(flattenKeys(ru).sort()).toEqual(flattenKeys(en).sort())
  })
})
