import { describe, expect, it } from 'vitest'
import { loadNoteEmbedHtml, rewriteEmbedAssetSrcs } from './noteEmbedHtml'

const resolve = (src: string) => `asset://${src}`

describe('rewriteEmbedAssetSrcs', () => {
  it('returns html unchanged without assets', () => {
    const html = '<p>hi <img src="__EMBED__/1.png"></p>'
    expect(rewriteEmbedAssetSrcs(html, [], resolve)).toBe(html)
  })

  it('matches by exact basename, not suffix', () => {
    const html = '<img src="__EMBED__/1.png"><img src="__EMBED__/11.png">'
    expect(rewriteEmbedAssetSrcs(html, ['a/11.png', 'b/1.png'], resolve))
      .toBe('<img src="asset://b/1.png"><img src="asset://a/11.png">')
  })

  it('matches escaped filenames and backslash srcs', () => {
    const html = '<img src="__EMBED__/a&amp;b.png"><img src="__EMBED__/c.png">'
    expect(rewriteEmbedAssetSrcs(html, ['x/a&b.png', String.raw`y\c.png`], resolve))
      .toBe(String.raw`<img src="asset://x/a&b.png"><img src="asset://y\c.png">`)
  })

  it('leaves non-embed srcs untouched', () => {
    const html = '<img src="https://e.com/1.png"><img src="__EMBED__/1.png">'
    expect(rewriteEmbedAssetSrcs(html, ['b/1.png'], resolve))
      .toBe('<img src="https://e.com/1.png"><img src="asset://b/1.png">')
  })
})

describe('loadNoteEmbedHtml', () => {
  it('rejects without a backend', async () => {
    await expect(loadNoteEmbedHtml(null, 'n', resolve)).rejects.toThrow('No workspace')
  })

  it('serializes the note body and resolves embedded assets', async () => {
    const backend = {
      loadNoteWithContent: async () => ({
        content: { type: 'doc', content: [{ type: 'image_block', attrs: { src: 'a/11.png' } }, { type: 'image_block', attrs: { src: 'b/1.png' } }] },
      }),
    }
    const html = await loadNoteEmbedHtml(backend as never, 'n', resolve)
    expect(html).toContain('src="asset://a/11.png"')
    expect(html).toContain('src="asset://b/1.png"')
    expect(html).not.toContain('__EMBED__')
  })
})
