import { describe, expect, it } from 'vitest'
import { detectEmbedProvider, generateEmbedHtml, resolveEmbed } from './oembed'

describe('oembed utils', () => {
  it('generates YouTube iframe markup with referrer policy', () => {
    const html = generateEmbedHtml('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube')

    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0"')
    expect(html).toContain('referrerpolicy="strict-origin-when-cross-origin"')
    expect(html).toContain('web-share')
  })

  it('recognizes youtu.be URLs as YouTube embeds', async () => {
    expect(detectEmbedProvider('https://youtu.be/dQw4w9WgXcQ')).toBe('youtube')

    const result = await resolveEmbed('https://youtu.be/dQw4w9WgXcQ')

    expect(result).toEqual({
      provider: 'youtube',
      title: '',
      embedHtml: '',
      thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    })
  })

  it('does not recognize lookalike YouTube hostnames', () => {
    for (const url of [
      'https://notyoutube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ',
      'https://notyoutu.be/dQw4w9WgXcQ',
    ]) {
      expect(detectEmbedProvider(url)).toBeNull()
      expect(generateEmbedHtml(url, 'youtube')).toBe('')
    }
  })
})
