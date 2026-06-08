import dataByGroup from 'unicode-emoji-json/data-by-group.json'

export interface EmojiItem {
  value: string
  name: string
  keywords: string[]
}

export interface EmojiCategory {
  id: string
  labelKey: string
  items: EmojiItem[]
}

interface UnicodeEmoji {
  emoji: string
  name: string
  slug: string
}

interface UnicodeEmojiGroup {
  name: string
  emojis: UnicodeEmoji[]
}

const categoryConfig = [
  {
    unicodeGroup: 'Smileys & Emotion',
    id: 'smileys',
    labelKey: 'workspace.iconPicker.categories.smileys',
  },
  {
    unicodeGroup: 'People & Body',
    id: 'people',
    labelKey: 'workspace.iconPicker.categories.people',
  },
  {
    unicodeGroup: 'Animals & Nature',
    id: 'nature',
    labelKey: 'workspace.iconPicker.categories.nature',
  },
  {
    unicodeGroup: 'Food & Drink',
    id: 'food',
    labelKey: 'workspace.iconPicker.categories.food',
  },
  {
    unicodeGroup: 'Activities',
    id: 'activities',
    labelKey: 'workspace.iconPicker.categories.activities',
  },
  {
    unicodeGroup: 'Travel & Places',
    id: 'travel',
    labelKey: 'workspace.iconPicker.categories.travel',
  },
  {
    unicodeGroup: 'Objects',
    id: 'objects',
    labelKey: 'workspace.iconPicker.categories.objects',
  },
  {
    unicodeGroup: 'Symbols',
    id: 'symbols',
    labelKey: 'workspace.iconPicker.categories.symbols',
  },
] as const

const skinToneComponentPattern = /[\u{1F3FB}-\u{1F3FF}]/u

function getKeywords(emoji: UnicodeEmoji): string[] {
  const tokens = new Set<string>()

  tokens.add(emoji.slug)

  for (const value of [emoji.name, emoji.slug]) {
    for (const token of value.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token) tokens.add(token)
    }
  }

  return Array.from(tokens)
}

function isPickerEmoji(emoji: UnicodeEmoji): boolean {
  const name = emoji.name.toLowerCase()

  return !skinToneComponentPattern.test(emoji.emoji) && !name.includes('skin tone')
}

const groups = dataByGroup as UnicodeEmojiGroup[]

export const emojiCategories: EmojiCategory[] = categoryConfig
  .map((category) => {
    const group = groups.find((item) => item.name === category.unicodeGroup)

    return {
      id: category.id,
      labelKey: category.labelKey,
      items: (group?.emojis ?? []).filter(isPickerEmoji).map((emoji) => ({
        value: emoji.emoji,
        name: emoji.name,
        keywords: getKeywords(emoji),
      })),
    }
  })
  .filter((category) => category.items.length > 0)
