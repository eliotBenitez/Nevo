import { describe, expect, it } from 'vitest'
import type { NoteDocument } from '../../types/note'
import { serializeNoteToTypst } from './typstSerializer'

function note(content: NoteDocument['content']): NoteDocument {
  return {
    id: 'n1', title: 'Doc', icon: '', folderId: null,
    createdAt: '', updatedAt: '', content,
  }
}

describe('serializeNoteToTypst', () => {
  it('emits a page preamble and title', () => {
    const { source } = serializeNoteToTypst(note({ type: 'doc', content: [] }))
    expect(source).toContain('#set page(paper: "a4"')
    expect(source).toContain('#heading(level: 1, numbering: none, outlined: false)[Doc]')
    expect(source).not.toContain('#set heading(numbering')
    expect(source).not.toContain('#outline()')
  })

  it('reflects document options in the preamble', () => {
    const { source } = serializeNoteToTypst(note({ type: 'doc', content: [] }), {
      paperFormat: 'A4', orientation: 'portrait', fontSize: 11, fontFamily: 'Times New Roman',
      marginPreset: 'normal', lineSpacing: 'relaxed', pageNumbers: true,
      headingNumbers: true, tableOfContents: true, titlePage: true, runningHeader: true,
    })
    expect(source).toContain('numbering: "1"')
    expect(source).toContain('font: ("Times New Roman", "Libertinus Serif")')
    expect(source).toContain('leading: 0.9em')
    expect(source).toContain('#set heading(numbering: "1.1.")')
    expect(source).toContain('#outline()\n#pagebreak()')
    expect(source).toContain('#align(center + horizon)')
    expect(source).toContain('header: [')
  })

  it('uses the embedded fallback font when none is selected', () => {
    const { source } = serializeNoteToTypst(note({ type: 'doc', content: [] }))
    expect(source).toContain('font: "Libertinus Serif"')
  })

  it('renders internal links as clickable deep links', () => {
    const { source } = serializeNoteToTypst(note({
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'see note', marks: [{ type: 'internal_link', attrs: { noteId: 'abc-123' } }] }],
      }],
    }))
    expect(source).toContain('#link("nevo://note/abc-123")[see note]')
  })

  it('maps headings, marks and code blocks', () => {
    const { source } = serializeNoteToTypst(note({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'bold', marks: [{ type: 'strong' }] }] },
        { type: 'code_block', attrs: { language: 'rust' }, content: [{ type: 'text', text: 'fn main() {}' }] },
      ],
    }))
    expect(source).toContain('== Title')
    expect(source).toContain('#strong[bold]')
    expect(source).toContain('#raw(block: true, lang: "rust", "fn main() {}")')
  })

  it('escapes typst special characters in text', () => {
    const { source } = serializeNoteToTypst(note({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a #b $c* _d' }] }],
    }))
    expect(source).toContain('a \\#b \\$c\\* \\_d')
  })

  it('converts math to native typst markup', () => {
    const { source } = serializeNoteToTypst(note({
      type: 'doc',
      content: [
        { type: 'math_block', attrs: { latex: '\\frac{1}{2}' } },
        { type: 'paragraph', content: [{ type: 'math_inline', attrs: { latex: 'x^2' } }] },
      ],
    }))
    expect(source).toContain('$ frac(1, 2) $')
    expect(source).toContain('$x^(2)$')
  })

  it('collects image and mermaid assets', () => {
    const { source, images, mermaid } = serializeNoteToTypst(note({
      type: 'doc',
      content: [
        { type: 'image_block', attrs: { src: 'assets/pic.png' } },
        { type: 'mermaid_block', attrs: { code: 'graph TD; A-->B' } },
      ],
    }))
    expect(images).toEqual([{ name: 'img-1.png', src: 'assets/pic.png' }])
    expect(mermaid).toEqual([{ name: 'mermaid-1.svg', code: 'graph TD; A-->B' }])
    expect(source).toContain('image("img-1.png"')
    expect(source).toContain('image("mermaid-1.svg")')
  })

  it('collects mind maps as SVG assets', () => {
    const { source, markmap } = serializeNoteToTypst(note({
      type: 'doc',
      content: [
        { type: 'markmap_block', attrs: { markdown: '# Topic\n## Idea' } },
      ],
    }))
    expect(markmap).toEqual([{ name: 'markmap-1.svg', markdown: '# Topic\n## Idea' }])
    expect(source).toContain('image("markmap-1.svg")')
  })

  it('collects Vega charts as SVG assets', () => {
    const spec = '{"$schema":"https://vega.github.io/schema/vega-lite/v6.json","mark":"bar"}'
    const { source, vega } = serializeNoteToTypst(note({
      type: 'doc',
      content: [
        { type: 'vega_block', attrs: { spec } },
      ],
    }))
    expect(vega).toEqual([{ name: 'vega-1.svg', spec }])
    expect(source).toContain('image("vega-1.svg")')
  })

  it('references assets through the archive assets folder when a prefix is provided', () => {
    const spec = '{"mark":"bar"}'
    const { source, images, mermaid, vega } = serializeNoteToTypst(note({
      type: 'doc',
      content: [
        { type: 'image_block', attrs: { src: 'assets/pic.png' } },
        { type: 'mermaid_block', attrs: { code: 'graph TD; A-->B' } },
        { type: 'vega_block', attrs: { spec } },
      ],
    }), undefined, { assetPathPrefix: 'Doc-typst_assets/' })
    expect(images).toEqual([{ name: 'img-1.png', src: 'assets/pic.png' }])
    expect(mermaid).toEqual([{ name: 'mermaid-1.svg', code: 'graph TD; A-->B' }])
    expect(vega).toEqual([{ name: 'vega-1.svg', spec }])
    expect(source).toContain('image("Doc-typst_assets/img-1.png"')
    expect(source).toContain('image("Doc-typst_assets/mermaid-1.svg")')
    expect(source).toContain('image("Doc-typst_assets/vega-1.svg")')
  })

  it('centers tables in the document', () => {
    const { source } = serializeNoteToTypst(note({
      type: 'doc',
      content: [{
        type: 'table',
        content: [
          { type: 'table_row', content: [
            { type: 'table_cell', content: [{ type: 'text', text: 'a' }] },
            { type: 'table_cell', content: [{ type: 'text', text: 'b' }] },
          ] },
        ],
      }],
    }))
    expect(source).toContain('#align(center)[#table(')
    expect(source).toContain('columns: 2')
  })

  it('renders bullet and ordered lists with items', () => {
    const { source } = serializeNoteToTypst(note({
      type: 'doc',
      content: [{
        type: 'bullet_list',
        content: [
          { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
          { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
        ],
      }],
    }))
    expect(source).toContain('#list(')
    expect(source).toContain('[one]')
    expect(source).toContain('[two]')
  })
})
