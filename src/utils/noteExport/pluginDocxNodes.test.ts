import { Packer } from 'docx'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import type { NevoNodeSerializer } from '../../types/editor-plugin'
import type { BlockNode, NoteDocument } from '../../types/note'
import { normalizeDocxFragment } from './docxFragment'
import { expandPluginDocxNodes } from './pluginDocxNodes'
import { serializeNoteToDocx } from './docxSerializer'

const text = (value: string, extra: object = {}) => ({ type: 'text', text: value, ...extra })

function note(content: BlockNode[]): NoteDocument {
  return {
    id: 'n1', title: 'Doc', icon: '', folderId: null, createdAt: '', updatedAt: '',
    content: { type: 'doc', content },
  }
}

function serializers(map: Record<string, NevoNodeSerializer>) {
  return (type: string) => map[type]
}

const child: BlockNode = { type: 'paragraph', content: [{ type: 'text', text: 'child' }] }
const pluginNode = (content?: BlockNode[]): BlockNode => ({ type: 'plugin_box', content })

describe('normalizeDocxFragment', () => {
  it('accepts every block type', () => {
    const fragment = normalizeDocxFragment({
      blocks: [
        { type: 'paragraph', children: [text('a', { bold: true, color: '#AABBCC', link: 'mailto:a@b.c' }), { type: 'break' }] },
        { type: 'heading', level: 2, children: [text('h')] },
        { type: 'table', header: true, rows: [[[text('x')], [text('y')]]] },
        { type: 'image', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>', caption: 'c' },
        { type: 'image', src: 'assets/a.png' },
        { type: 'children' },
      ],
    })
    expect(fragment?.blocks).toHaveLength(6)
  })

  it.each([
    ['bad color', { type: 'paragraph', children: [text('a', { color: 'red' })] }],
    ['javascript link', { type: 'paragraph', children: [text('a', { link: 'javascript:alert(1)' })] }],
    ['parent segment', { type: 'image', src: 'a/../../b.png' }],
    ['absolute src', { type: 'image', src: '/etc/passwd' }],
    ['scheme src', { type: 'image', src: 'https://x/y.png' }],
    ['backslash src', { type: 'image', src: 'a\\b.png' }],
    ['unknown type', { type: 'video' }],
    ['bad heading level', { type: 'heading', level: 7, children: [] }],
    ['empty svg', { type: 'image', svg: '' }],
    ['long caption', { type: 'image', src: 'a.png', caption: 'x'.repeat(1001) }],
  ])('rejects %s', (_name, block) => {
    expect(normalizeDocxFragment({ blocks: [block] })).toBeNull()
  })

  it('rejects oversized fragments and non-objects', () => {
    expect(normalizeDocxFragment({ blocks: Array.from({ length: 501 }, () => ({ type: 'children' })) })).toBeNull()
    expect(normalizeDocxFragment({ blocks: [{ type: 'table', rows: Array.from({ length: 201 }, () => []) }] })).toBeNull()
    expect(normalizeDocxFragment({ blocks: [{ type: 'table', rows: [Array.from({ length: 51 }, () => [])] }] })).toBeNull()
    expect(normalizeDocxFragment({ blocks: [{ type: 'paragraph', children: [text('x'.repeat(1024 * 1024 + 1))] }] })).toBeNull()
    expect(normalizeDocxFragment(null)).toBeNull()
    expect(normalizeDocxFragment([])).toBeNull()
  })

  it('strips scripts from svg', () => {
    const fragment = normalizeDocxFragment({
      blocks: [{ type: 'image', svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect width="1" height="1"/></svg>' }],
    })
    const block = fragment?.blocks[0]
    const svg = block && 'svg' in block ? block.svg : ''
    expect(svg).not.toContain('script')
    expect(svg).toContain('rect')
  })
})

describe('expandPluginDocxNodes', () => {
  it('maps each block type to Nevo node JSON', async () => {
    const source = note([pluginNode([child])])
    const result = await expandPluginDocxNodes(source, serializers({
      plugin_box: {
        docx: () => ({
          blocks: [
            { type: 'heading', level: 3, children: [text('H', { bold: true, italic: true, link: 'https://a.b' }), text('')] },
            { type: 'paragraph', children: [text('P', { color: '#112233' }), { type: 'break' }] },
            { type: 'table', header: true, rows: [[[text('a')], [text('b')]], [[text('c')], [text('d')]]] },
            { type: 'image', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"><rect width="4" height="4"/></svg>', caption: 'cap' },
            { type: 'image', src: 'assets/x.png' },
            { type: 'children' },
          ],
        }) as never,
      },
    }))
    const nodes = result.content.content!
    expect(nodes[0]).toEqual({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'H', marks: [{ type: 'strong' }, { type: 'em' }, { type: 'link', attrs: { href: 'https://a.b' } }] }],
    })
    expect(nodes[1]?.content).toEqual([
      { type: 'text', text: 'P', marks: [{ type: 'text_color', attrs: { color: '#112233' } }] },
      { type: 'hard_break' },
    ])
    expect(nodes[2]?.content?.[0]?.content?.[0]?.type).toBe('table_header')
    expect(nodes[2]?.content?.[1]?.content?.[0]?.type).toBe('table_cell')
    expect(nodes[3]).toMatchObject({ type: 'draw_block', attrs: { title: 'cap' } })
    expect(nodes[4]).toEqual({ type: 'image_block', attrs: { src: 'assets/x.png', caption: '' } })
    expect(nodes[5]).toEqual(child)
    expect(source.content.content).toEqual([pluginNode([child])])
  })

  it('keeps the node when the serializer throws or returns an invalid fragment', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const source = note([pluginNode([child])])
    const throwing = await expandPluginDocxNodes(source, serializers({
      plugin_box: { docx: () => { throw new Error('boom') } },
    }))
    const invalid = await expandPluginDocxNodes(source, serializers({
      plugin_box: { docx: () => ({ blocks: [{ type: 'nope' }] }) as never },
    }))
    expect(throwing.content.content).toEqual([pluginNode([child])])
    expect(invalid.content.content).toEqual([pluginNode([child])])
    expect(warn).toHaveBeenCalledTimes(2)
    warn.mockRestore()
  })

  it('expands nested plugin nodes before their parent', async () => {
    const source = note([{ type: 'plugin_outer', content: [{ type: 'plugin_inner' }] }])
    const result = await expandPluginDocxNodes(source, serializers({
      plugin_inner: { docx: () => ({ blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'inner' }] }] }) },
      plugin_outer: {
        docx: node => ({
          blocks: [
            { type: 'heading', level: 1, children: [{ type: 'text', text: `outer:${node.content?.[0]?.type}` }] },
            { type: 'children' },
          ],
        }),
      },
    }))
    expect(result.content.content).toEqual([
      { type: 'heading', attrs: { level: 1 }, content: [text('outer:paragraph')] },
      { type: 'paragraph', content: [text('inner')] },
    ])
  })

  it('produces DOCX output containing the fragment text', async () => {
    const expanded = await expandPluginDocxNodes(note([pluginNode()]), serializers({
      plugin_box: { docx: () => ({ blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'Fragment text' }] }] }) },
    }))
    const doc = await serializeNoteToDocx(expanded, {
      loadAssetImage: vi.fn(async () => null),
      rasterizeSvg: vi.fn(async () => null),
    })
    const zip = await JSZip.loadAsync(await Packer.toBuffer(doc))
    expect(await zip.file('word/document.xml')!.async('string')).toContain('Fragment text')
  })
})
