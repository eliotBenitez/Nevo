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

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let tofuData: Uint8ClampedArray | null = null
let doubleTofuData: Uint8ClampedArray | null = null
let singleEmojiWidth = 0

function initCanvas() {
  if (typeof document === 'undefined') return
  try {
    canvas = document.createElement('canvas')
    canvas.width = 32
    canvas.height = 32
    ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return

    ctx.font = '16px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'
    ctx.textBaseline = 'top'

    // Measure base single emoji width
    singleEmojiWidth = ctx.measureText('😀').width

    // Render a known unsupported glyph (tofu) to compare
    // Unicode \uFFFF is guaranteed to be unsupported
    ctx.clearRect(0, 0, 32, 32)
    ctx.fillText('\u{FFFF}', 0, 0)
    tofuData = ctx.getImageData(0, 0, 32, 32).data

    // Also render two tofus to capture split rendering if needed
    ctx.clearRect(0, 0, 32, 32)
    ctx.fillText('\u{FFFF}\u{FFFF}', 0, 0)
    doubleTofuData = ctx.getImageData(0, 0, 32, 32).data
  } catch (e) {
    ctx = null
  }
}

const supportCache = new Map<string, boolean>()

export function isEmojiSupported(emoji: string): boolean {
  if (typeof document === 'undefined') return true
  if (supportCache.has(emoji)) return supportCache.get(emoji)!

  if (!canvas) {
    initCanvas()
  }
  if (!ctx || !tofuData) return true // Fallback to true if Canvas/Context is not available

  try {
    // 1. Check width first
    const width = ctx.measureText(emoji).width
    // If it's a ZWJ sequence/compound emoji and split into multiple parts, it will be much wider
    // than a single emoji
    if (singleEmojiWidth > 0 && width > singleEmojiWidth * 1.8) {
      supportCache.set(emoji, false)
      return false
    }

    // 2. Render target emoji
    ctx.clearRect(0, 0, 32, 32)
    ctx.fillText(emoji, 0, 0)
    const emojiData = ctx.getImageData(0, 0, 32, 32).data

    // 3. Compare with tofuData
    let matchTofu = true
    for (let i = 0; i < tofuData.length; i++) {
      if (tofuData[i] !== emojiData[i]) {
        matchTofu = false
        break
      }
    }
    if (matchTofu) {
      supportCache.set(emoji, false)
      return false
    }

    // 4. Also compare with doubleTofuData
    if (doubleTofuData) {
      let matchDoubleTofu = true
      for (let i = 0; i < doubleTofuData.length; i++) {
        if (doubleTofuData[i] !== emojiData[i]) {
          matchDoubleTofu = false
          break
        }
      }
      if (matchDoubleTofu) {
        supportCache.set(emoji, false)
        return false
      }
    }

    // 5. Check if it's completely blank (all transparent pixels)
    let isBlank = true
    for (let i = 3; i < emojiData.length; i += 4) {
      if (emojiData[i] !== 0) {
        isBlank = false
        break
      }
    }
    if (isBlank) {
      supportCache.set(emoji, false)
      return false
    }

    supportCache.set(emoji, true)
    return true
  } catch (e) {
    return true
  }
}

/**
 * Асинхронно фильтрует список категорий эмодзи порциями, чтобы не блокировать UI thread.
 */
export function filterUnsupportedEmojisAsync(
  categories: EmojiCategory[]
): Promise<EmojiCategory[]> {
  return new Promise((resolve) => {
    const result: EmojiCategory[] = categories.map((cat) => ({
      ...cat,
      items: [],
    }))

    let categoryIndex = 0
    let itemIndex = 0
    const batchSize = 150

    function processBatch() {
      let processed = 0

      while (categoryIndex < categories.length && processed < batchSize) {
        const sourceCat = categories[categoryIndex]
        const destCat = result[categoryIndex]

        const itemsToProcess = sourceCat.items.slice(itemIndex, itemIndex + (batchSize - processed))
        for (const item of itemsToProcess) {
          if (isEmojiSupported(item.value)) {
            destCat.items.push(item)
          }
        }

        processed += itemsToProcess.length
        itemIndex += itemsToProcess.length

        if (itemIndex >= sourceCat.items.length) {
          categoryIndex++
          itemIndex = 0
        }
      }

      if (categoryIndex < categories.length) {
        if (typeof requestIdleCallback === 'function') {
          requestIdleCallback(() => processBatch())
        } else {
          setTimeout(processBatch, 0)
        }
      } else {
        const finalResult = result.filter((cat) => cat.items.length > 0)
        resolve(finalResult)
      }
    }

    processBatch()
  })
}
