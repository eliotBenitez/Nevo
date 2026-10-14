import { describe, expect, it } from 'vitest'
import { nevoBaseSchema } from '../../../editor-core/schema'
import { hasSemanticHtml, parseMarkdownToSlice } from './markdownPaste'

describe('parseMarkdownToSlice', () => {
  it('keeps a leading H1 as a heading instead of dropping it as a title', () => {
    const slice = parseMarkdownToSlice('# Title\r\n\r\n- a', nevoBaseSchema)
    expect(slice?.content.firstChild?.type.name).toBe('heading')
    expect(slice?.content.firstChild?.attrs.level).toBe(1)
    expect(slice?.content.childCount).toBe(2)
  })
})

describe('hasSemanticHtml', () => {
  it('ignores bare code-editor wrappers and detects real formatting', () => {
    expect(hasSemanticHtml('<div><span># md</span><br></div>')).toBe(false)
    expect(hasSemanticHtml('<p><strong>x</strong></p>')).toBe(true)
    expect(hasSemanticHtml('<H2>x</H2>')).toBe(true)
  })
})
