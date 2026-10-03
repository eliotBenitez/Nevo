import { describe, expect, it } from 'vitest'
import { getSearchableIcons } from './iconPickerIcons'

describe('iconPickerIcons', () => {
  it('builds the Lucide catalogue once and reuses the same entries', () => {
    const first = getSearchableIcons()
    const second = getSearchableIcons()

    expect(second).toBe(first)
    expect(first.length).toBeGreaterThan(1000)
    expect(first[0]).toMatchObject({ token: expect.stringMatching(/^lucide:/), label: expect.any(String) })
  })
})
