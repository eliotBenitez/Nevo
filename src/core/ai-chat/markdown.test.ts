import { describe, expect, it } from 'vitest'
import { parseChatMarkdown, type ChatBlock, type ChatInline } from './markdown'

type ListBlock = Extract<ChatBlock, { kind: 'list' }>
const firstParagraph = (text: string) => (parseChatMarkdown(text)[0] as { children: ChatInline[] }).children

describe('parseChatMarkdown', () => {
  it('returns no blocks for empty text', () => {
    expect(parseChatMarkdown('')).toEqual([])
  })

  it('parses headings, lists and nesting', () => {
    const blocks = parseChatMarkdown('## Title\n\n- a\n  - b\n- c\n\n3. x\n4. y')
    expect(blocks[0]).toMatchObject({ kind: 'heading', depth: 2 })
    const ul = blocks[1] as ListBlock
    expect(ul.ordered).toBe(false)
    expect(ul.items).toHaveLength(2)
    expect(ul.items[0].children[1]).toMatchObject({ kind: 'list' })
    expect(blocks[2]).toMatchObject({ kind: 'list', ordered: true, start: 3 })
  })

  it('parses task lists', () => {
    const [list] = parseChatMarkdown('- [x] done\n- [ ] todo\n- plain') as ListBlock[]
    expect(list.items.map(i => i.checked)).toEqual([true, false, null])
  })

  it('keeps a fenced block with a blank line as one code block', () => {
    expect(parseChatMarkdown('```ts\na[1]\n\nb\n```')).toEqual([{ kind: 'code', lang: 'ts', value: 'a[1]\n\nb' }])
  })

  it('only turns prose [n] into citations', () => {
    const children = firstParagraph('see `x[1]` and [2]')
    expect(children).toContainEqual({ kind: 'code', value: 'x[1]' })
    expect(children).toContainEqual({ kind: 'cite', n: 2 })
    expect(children).not.toContainEqual({ kind: 'cite', n: 1 })
  })

  it('parses strong, em and del', () => {
    const kinds = firstParagraph('**a** *b* ~~c~~').map(c => c.kind).filter(k => k !== 'text')
    expect(kinds).toEqual(['strong', 'em', 'del'])
  })

  it('drops link urls and keeps image alt as text', () => {
    const children = firstParagraph('[site](http://x.test) ![alt text](http://x.test/i.png)')
    expect(children.every(c => c.kind === 'text')).toBe(true)
    expect(children.map(c => (c as { value: string }).value).join('')).toBe('site alt text')
  })

  it('shows raw html as text', () => {
    const children = firstParagraph('<img src=x onerror=alert(1)>')
    expect(children.every(c => c.kind === 'text')).toBe(true)
    expect(children.map(c => (c as { value: string }).value).join('')).toContain('<img src=x')
  })

  it('parses GFM tables', () => {
    const [table] = parseChatMarkdown('| a | b |\n|---|---|\n| 1 | 2 |') as Extract<ChatBlock, { kind: 'table' }>[]
    expect(table.kind).toBe('table')
    expect(table.header).toHaveLength(2)
    expect(table.rows).toHaveLength(1)
  })

  it('tolerates partial streaming text', () => {
    expect(parseChatMarkdown('```js\nconst a =')[0]).toMatchObject({ kind: 'code' })
    expect(() => parseChatMarkdown('| a | b |\n|---')).not.toThrow()
  })
})
