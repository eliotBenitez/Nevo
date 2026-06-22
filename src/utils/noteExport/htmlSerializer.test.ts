import { describe, expect, it } from 'vitest'
import type { NoteDocument } from '../../types/note'
import { serializeNoteToHtml } from './htmlSerializer'

function note(content: NoteDocument['content'], title = 'Doc'): NoteDocument {
  return {
    id: 'n1', title, icon: '', folderId: null,
    createdAt: '', updatedAt: '', content,
  }
}

describe('serializeNoteToHtml', () => {
  it('emits a full HTML document and escapes title and text', async () => {
    const { html } = await serializeNoteToHtml(note({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '<hello> & "world"' }] }],
    }, 'A <B> & C'), 'Doc_assets')

    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<meta charset="utf-8">')
    expect(html).toContain('<title>A &lt;B&gt; &amp; C</title>')
    expect(html).toContain('<h1 class="note-title">A &lt;B&gt; &amp; C</h1>')
    expect(html).toContain('<p>&lt;hello&gt; &amp; "world"</p>')
  })

  it('renders marks and external/internal links semantically', async () => {
    const { html } = await serializeNoteToHtml(note({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'bold', marks: [{ type: 'strong' }] },
          { type: 'text', text: ' em', marks: [{ type: 'em' }] },
          { type: 'text', text: ' code', marks: [{ type: 'code' }] },
          { type: 'text', text: ' strike', marks: [{ type: 'strike' }] },
          { type: 'text', text: ' under', marks: [{ type: 'underline' }] },
          { type: 'text', text: ' hi', marks: [{ type: 'highlight', attrs: { color: '#fef08a' } }] },
          { type: 'text', text: ' red', marks: [{ type: 'text_color', attrs: { color: '#ef4444' } }] },
          { type: 'text', text: ' sup', marks: [{ type: 'superscript' }] },
          { type: 'text', text: ' sub', marks: [{ type: 'subscript' }] },
          { type: 'text', text: ' web', marks: [{ type: 'link', attrs: { href: 'https://example.test?a=1&b=2' } }] },
          { type: 'text', text: ' note', marks: [{ type: 'internal_link', attrs: { noteId: 'abc 123', anchor: 'Block One' } }] },
        ],
      }],
    }), 'Doc_assets')

    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<em> em</em>')
    expect(html).toContain('<code> code</code>')
    expect(html).toContain('<s> strike</s>')
    expect(html).toContain('<u> under</u>')
    expect(html).toContain('<mark style="background-color: #fef08a"> hi</mark>')
    expect(html).toContain('<span style="color: #ef4444"> red</span>')
    expect(html).toContain('<sup> sup</sup>')
    expect(html).toContain('<sub> sub</sub>')
    expect(html).toContain('<a href="https://example.test?a=1&amp;b=2"> web</a>')
    expect(html).toContain('<a href="nevo://note/abc%20123#Block%20One" data-note-id="abc 123" data-anchor="Block One"> note</a>')
  })

  it('collects local images, files, media and posters and points at the export assets folder', async () => {
    const { html, assetSrcs } = await serializeNoteToHtml(note({
      type: 'doc',
      content: [
        { type: 'image_block', attrs: { src: '.nevo/assets/pic.png', alt: 'A <pic>', caption: 'Caption' } },
        { type: 'file_block', attrs: { src: '.nevo/assets/doc.pdf', filename: 'Doc.pdf' } },
        { type: 'media_block', attrs: { kind: 'video', src: '.nevo/assets/movie.mp4', poster: '.nevo/assets/poster.jpg', name: 'Movie', mime: 'video/mp4' } },
        { type: 'media_block', attrs: { kind: 'audio', src: 'https://cdn.test/audio.mp3', name: 'Remote audio' } },
      ],
    }, 'Doc'), 'Export_assets')

    expect(assetSrcs).toEqual([
      '.nevo/assets/pic.png',
      '.nevo/assets/doc.pdf',
      '.nevo/assets/movie.mp4',
      '.nevo/assets/poster.jpg',
    ])
    expect(html).toContain('<img src="Export_assets/pic.png" alt="A &lt;pic&gt;">')
    expect(html).toContain('<figcaption>Caption</figcaption>')
    expect(html).toContain('<a href="Export_assets/doc.pdf" download>Doc.pdf</a>')
    expect(html).toContain('<video controls poster="Export_assets/poster.jpg"><source src="Export_assets/movie.mp4" type="video/mp4"></video>')
    expect(html).toContain('<audio controls><source src="https://cdn.test/audio.mp3"></audio>')
  })

  it('renders tables, code blocks, callouts, toggles, math, mermaid and note embeds', async () => {
    const { html } = await serializeNoteToHtml(note({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Section' }] },
        { type: 'code_block', attrs: { language: 'ts' }, content: [{ type: 'text', text: 'const x = "<tag>"' }] },
        {
          type: 'table',
          content: [
            {
              type: 'table_row',
              content: [
                { type: 'table_header', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Head' }] }] },
                { type: 'table_cell', attrs: { align: 'right', background: '#fff' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cell' }] }] },
              ],
            },
            {
              type: 'table_row',
              content: [
                { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Next' }] }] },
                { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Row' }] }] },
              ],
            },
          ],
        },
        { type: 'callout', attrs: { variant: 'warning', icon: '!' }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Callout' }] }] },
        { type: 'math_block', attrs: { latex: '\\frac{1}{2}' } },
        { type: 'mermaid_block', attrs: { code: 'graph TD\n  A-->B' } },
        { type: 'note_embed', attrs: { noteId: 'n2', title: 'Other note', previewText: 'Preview <text>' } },
      ],
    }), 'Doc_assets')

    expect(html).toContain('<h2>Section</h2>')
    expect(html).toContain('<pre><code class="language-ts">const x = "&lt;tag&gt;"</code></pre>')
    expect(html).toContain('<th>Head</th>')
    expect(html).toContain('<td style="text-align: right; background-color: #fff">Cell</td>')
    expect(html).toContain('<tr><th>Head</th><td style="text-align: right; background-color: #fff">Cell</td></tr>\n<tr><td>Next</td><td>Row</td></tr>')
    expect(html).not.toContain('</tr>,<tr>')
    expect(html).toContain('<aside class="callout" data-variant="warning"><span class="callout-icon">!</span>')
    expect(html).toContain('<div class="math-block" data-latex="\\frac{1}{2}"><div class="math-render"><span class="katex-display">')
    expect(html).toMatch(/<div class="mermaid-(render|error)">/)
    expect(html).toMatch(/<img class="mermaid-svg" src="data:image\/svg\+xml;charset=utf-8,|<div class="mermaid-error">/)
    expect(html).toContain('<summary>Mermaid source</summary>')
    expect(html).toContain('<article class="note-embed" data-note-id="n2"><a href="nevo://note/n2">Other note</a><p>Preview &lt;text&gt;</p></article>')
  })

  it('renders drawings, embeds and toggles', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'
    const { html } = await serializeNoteToHtml(note({
      type: 'doc',
      content: [
        { type: 'draw_block', attrs: { drawId: 'd1', svgPreview: svg, title: 'Sketch' } },
        { type: 'draw_block', attrs: { drawId: 'd2', svgPreview: '', title: '' } },
        { type: 'embed_block', attrs: { url: 'https://youtu.be/x', title: 'Clip' } },
        {
          type: 'toggle',
          content: [
            { type: 'toggle_title', content: [{ type: 'text', text: 'Summary' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'Hidden body' }] },
          ],
        },
      ],
    }), 'Doc_assets')

    expect(html).toContain('<figure class="draw-block"><div class="draw-render"><img class="draw-svg" src="data:image/svg+xml;charset=utf-8,')
    expect(html).toContain('<figcaption>Sketch</figcaption>')
    expect(html).toContain('<figure class="embed-block"><a href="https://youtu.be/x">Clip</a></figure>')
    expect(html).toContain('<details open><summary>Summary</summary>')
    expect(html).toContain('<p>Hidden body</p>')
  })

  it('renders KaTeX output and exports local cover images', async () => {
    const { html, assetSrcs } = await serializeNoteToHtml(note({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Before ' },
            { type: 'math_inline', attrs: { latex: 'x^2' } },
            { type: 'text', text: ' after' },
          ],
        },
        { type: 'math_block', attrs: { latex: '\\frac{1}{2}' } },
      ],
    }, 'Math doc'), 'Math doc_assets')

    const withCover = await serializeNoteToHtml({
      ...note({ type: 'doc', content: [] }, 'Cover doc'),
      cover: 'image:.nevo/assets/cover.jpg',
    }, 'Cover doc_assets')

    expect(html).toContain('class="katex"')
    expect(html).toContain('<p>Before <span class="math-inline"')
    expect(html).toContain('</span> after</p>')
    expect(html).toContain('katex-display')
    expect(html).toContain('.katex')
    expect(html).not.toContain('KaTeX_Main-Regular.woff2')
    expect(html).not.toContain('url(fonts/')
    expect(withCover.assetSrcs).toEqual(['.nevo/assets/cover.jpg'])
    expect(withCover.html).toContain('class="note-cover"')
    expect(withCover.html).toContain('Cover doc_assets/cover.jpg')
    expect(assetSrcs).toEqual([])
  })
})
