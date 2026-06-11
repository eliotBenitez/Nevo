import { describe, expect, it } from 'vitest'
import { renderReleaseNotesHtml } from './releaseNotesMarkdown'

describe('renderReleaseNotesHtml', () => {
  it('escapes raw HTML to prevent injection', () => {
    const html = renderReleaseNotesHtml('Hello <script>alert(1)</script> world')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders bullet lists', () => {
    const html = renderReleaseNotesHtml('- one\n- two')
    expect(html).toBe('<ul><li>one</li><li>two</li></ul>')
  })

  it('renders ordered lists', () => {
    const html = renderReleaseNotesHtml('1. first\n2. second')
    expect(html).toBe('<ol><li>first</li><li>second</li></ol>')
  })

  it('renders headings as compact tags', () => {
    expect(renderReleaseNotesHtml('# Title')).toBe('<h4>Title</h4>')
    expect(renderReleaseNotesHtml('### Sub')).toBe('<h5>Sub</h5>')
  })

  it('renders bold and inline code', () => {
    const html = renderReleaseNotesHtml('Use **bold** and `code` here')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<code>code</code>')
  })

  it('renders http(s) links with safe attributes', () => {
    const html = renderReleaseNotesHtml('See [docs](https://example.com/x) now')
    expect(html).toContain('<a href="https://example.com/x" target="_blank" rel="noopener noreferrer">docs</a>')
  })

  it('ignores non-http link schemes (left as inert text, never a link)', () => {
    const html = renderReleaseNotesHtml('[click](javascript:alert(1))')
    expect(html).not.toContain('<a ')
    expect(html).not.toContain('href=')
  })

  it('wraps plain text into paragraphs split on blank lines', () => {
    const html = renderReleaseNotesHtml('line one\n\nline two')
    expect(html).toBe('<p>line one</p><p>line two</p>')
  })

  it('handles CRLF line endings', () => {
    const html = renderReleaseNotesHtml('- a\r\n- b')
    expect(html).toBe('<ul><li>a</li><li>b</li></ul>')
  })
})
