import { afterEach, describe, expect, it, vi } from 'vitest'
import { emojiCategories, filterUnsupportedEmojisAsync } from './iconPickerEmoji'

afterEach(() => {
  vi.restoreAllMocks()
})

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

  it('shares the in-flight filtered result for the default category list', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    const first = filterUnsupportedEmojisAsync(emojiCategories)
    const second = filterUnsupportedEmojisAsync(emojiCategories)

    expect(second).toBe(first)
    await first
  })

  it('defers the first canvas probe so opening the picker can paint first', async () => {
    vi.resetModules()
    const emojiModule = await import('./iconPickerEmoji')
    const fillText = vi.fn()
    const context = {
      font: '',
      textBaseline: '',
      measureText: () => ({ width: 16 }),
      clearRect: vi.fn(),
      fillText,
      getImageData: () => ({ data: new Uint8ClampedArray(32 * 32 * 4) }),
    }
    const getContext = vi.fn(() => context)
    vi.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'canvas') return { width: 0, height: 0, getContext } as unknown as HTMLCanvasElement
      return document.createElementNS('http://www.w3.org/1999/xhtml', tagName) as unknown as HTMLElement
    }) as typeof document.createElement)
    const categories = [{
      id: 'test',
      labelKey: 'test',
      items: [{ value: '🫠', name: 'melting face', keywords: [] }],
    }]

    const result = emojiModule.filterUnsupportedEmojisAsync(categories)

    expect(getContext).not.toHaveBeenCalled()
    await result
    expect(getContext).toHaveBeenCalledOnce()
  })

  it('skips empty categories while filtering supported emoji', async () => {
    const categories = [
      { id: 'empty-before', labelKey: 'empty', items: [] },
      { id: 'filled', labelKey: 'filled', items: [{ value: '😀', name: 'grinning face', keywords: [] }] },
      { id: 'empty-after', labelKey: 'empty', items: [] },
    ]

    await expect(filterUnsupportedEmojisAsync(categories)).resolves.toMatchObject([
      { id: 'filled', items: [{ value: '😀' }] },
    ])
  })
})
