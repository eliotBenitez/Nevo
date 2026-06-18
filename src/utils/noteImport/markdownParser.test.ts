import { describe, expect, it } from 'vitest'
import { parseMarkdownToBlockNode } from './markdownParser'

function inline(doc: unknown): any[] {
  // doc is { type: 'doc', content: [...] }; grab first paragraph content.
  const blocks = (doc as any).content ?? []
  const paragraph = blocks.find((b: any) => b.type === 'paragraph')
  return paragraph?.content ?? []
}

describe('parseMarkdownToBlockNode — wiki links [[...]]', () => {
  it('parses a plain [[Note]] into an internal_link mark', () => {
    const { content } = parseMarkdownToBlockNode('See [[Ideas]]', 'Doc', (t) => (t === 'Ideas' ? 'note-ideas' : null))
    const nodes = inline(content)
    const link = nodes.find((n: any) => n.marks?.some((m: any) => m.type === 'internal_link'))
    expect(link).toBeDefined()
    expect(link.text).toBe('Ideas')
    const mark = link.marks.find((m: any) => m.type === 'internal_link')
    expect(mark.attrs).toMatchObject({ noteId: 'note-ideas', title: 'Ideas', anchor: null, alias: null })
  })

  it('parses [[Note#Section]] with an anchor', () => {
    const { content } = parseMarkdownToBlockNode('[[Ideas#Plan]]', 'Doc', () => 'note-ideas')
    const nodes = inline(content)
    const link = nodes.find((n: any) => n.marks?.some((m: any) => m.type === 'internal_link'))
    expect(link.text).toBe('Ideas')
    const mark = link.marks.find((m: any) => m.type === 'internal_link')
    expect(mark.attrs).toMatchObject({ noteId: 'note-ideas', title: 'Ideas', anchor: 'Plan', alias: null })
  })

  it('parses [[Note|Alias]] with an alias, using it as display text', () => {
    const { content } = parseMarkdownToBlockNode('[[Ideas|my note]]', 'Doc', () => 'note-ideas')
    const nodes = inline(content)
    const link = nodes.find((n: any) => n.marks?.some((m: any) => m.type === 'internal_link'))
    expect(link.text).toBe('my note')
    const mark = link.marks.find((m: any) => m.type === 'internal_link')
    expect(mark.attrs).toMatchObject({ noteId: 'note-ideas', title: 'Ideas', alias: 'my note' })
  })

  it('parses the full form [[Note#Section|Alias]]', () => {
    const { content } = parseMarkdownToBlockNode('[[Ideas#Plan|the plan]]', 'Doc', () => 'note-ideas')
    const nodes = inline(content)
    const link = nodes.find((n: any) => n.marks?.some((m: any) => m.type === 'internal_link'))
    expect(link.text).toBe('the plan')
    const mark = link.marks.find((m: any) => m.type === 'internal_link')
    expect(mark.attrs).toMatchObject({ noteId: 'note-ideas', title: 'Ideas', anchor: 'Plan', alias: 'the plan' })
  })

  it('produces a broken link (empty noteId) when the resolver returns null', () => {
    const { content } = parseMarkdownToBlockNode('[[Ghost]]', 'Doc', () => null)
    const nodes = inline(content)
    const link = nodes.find((n: any) => n.marks?.some((m: any) => m.type === 'internal_link'))
    expect(link).toBeDefined()
    const mark = link.marks.find((m: any) => m.type === 'internal_link')
    expect(mark.attrs.noteId).toBe('')
    expect(mark.attrs.title).toBe('Ghost')
  })

  it('keeps surrounding plain text when expanding a wiki link', () => {
    const { content } = parseMarkdownToBlockNode('before [[Ideas]] after', 'Doc', () => 'note-ideas')
    const nodes = inline(content)
    const texts = nodes.map((n: any) => n.text)
    expect(texts).toEqual(['before ', 'Ideas', ' after'])
  })

  it('leaves text untouched when no resolver is provided', () => {
    const { content } = parseMarkdownToBlockNode('See [[Ideas]] plain', 'Doc')
    const nodes = inline(content)
    // No wiki-link expansion without a resolver: text stays as a single node.
    expect(nodes.length).toBe(1)
    expect(nodes[0].text).toBe('See [[Ideas]] plain')
  })
})
