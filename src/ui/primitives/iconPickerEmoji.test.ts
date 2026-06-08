import { describe, expect, it } from 'vitest'
import { emojiCategories } from './iconPickerEmoji'

describe('iconPickerEmoji', () => {
  it('maps unicode emoji groups to picker categories without flags', () => {
    expect(emojiCategories.map((category) => category.id)).toEqual([
      'smileys',
      'people',
      'nature',
      'food',
      'activities',
      'travel',
      'objects',
      'symbols',
    ])

    const totalItems = emojiCategories.reduce((sum, category) => sum + category.items.length, 0)

    expect(totalItems).toBeGreaterThan(1000)
  })

  it('keeps searchable names, slug keywords, and unicode values', () => {
    const smileys = emojiCategories.find((category) => category.id === 'smileys')
    const grinningFace = smileys?.items.find((item) => item.value === '😀')

    expect(grinningFace).toMatchObject({
      value: '😀',
      name: 'grinning face',
    })
    expect(grinningFace?.keywords).toEqual(expect.arrayContaining(['grinning_face', 'grinning', 'face']))
  })
})
