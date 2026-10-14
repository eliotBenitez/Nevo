import { describe, expect, it } from 'vitest'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { hasSemanticHtml, looksLikeMarkdown, parseMarkdownToSlice } from './markdownPaste'

describe('parseMarkdownToSlice', () => {
  it('keeps a leading H1 as a heading instead of dropping it as a title', () => {
    const slice = parseMarkdownToSlice('# Title\r\n\r\n- a', nevoBaseSchema)
    expect(slice?.content.firstChild?.type.name).toBe('heading')
    expect(slice?.content.firstChild?.attrs.level).toBe(1)
    expect(slice?.content.childCount).toBe(2)
  })

  it('recognizes an image-only paste as Markdown', () => {
    expect(looksLikeMarkdown('![cat](https://example.com/cat.png)')).toBe(true)
  })

  it('lifts inline images out of paragraphs and list items into valid image blocks', () => {
    const slice = parseMarkdownToSlice('see ![cat](https://e.x/cat.png) inline\n\n- item ![x](a.png)\n\n[![badge](https://e.x/b.svg)](https://e.x)', nevoBaseSchema)
    expect(slice).not.toBeNull()
    slice!.content.forEach(node => node.check())
    expect(slice!.content.toJSON().map((n: { type: string }) => n.type)).toEqual(['paragraph', 'image_block', 'paragraph', 'bullet_list', 'image_block'])
    expect(slice!.content.child(1).attrs.src).toBe('https://e.x/cat.png')
  })

  it('falls back to alt text for images in headings', () => {
    const slice = parseMarkdownToSlice('## Logo ![nevo](logo.png)', nevoBaseSchema)
    slice!.content.forEach(node => node.check())
    expect(slice!.content.firstChild?.textContent).toBe('Logo nevo')
  })

  it('converts <u> tags to the underline mark', () => {
    expect(looksLikeMarkdown('plain <u>under</u> text')).toBe(true)
    const para = parseMarkdownToSlice('a <u>under **both**</u> b', nevoBaseSchema)?.content.firstChild
    const marked = para?.content.content.map(n => [n.text, n.marks.map(m => m.type.name).join('+')])
    expect(marked).toEqual([['a ', ''], ['under ', 'underline'], ['both', 'strong+underline'], [' b', '']])
  })
})

describe('hasSemanticHtml', () => {
  it('ignores bare code-editor wrappers and detects real formatting', () => {
    expect(hasSemanticHtml('<div><span># md</span><br></div>')).toBe(false)
    expect(hasSemanticHtml('<p><strong>x</strong></p>')).toBe(true)
    expect(hasSemanticHtml('<H2>x</H2>')).toBe(true)
  })
})
