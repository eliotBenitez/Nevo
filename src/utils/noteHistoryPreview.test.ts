import { describe, expect, it } from 'vitest'
import type { BlockNode } from '../types/note'
import { buildHistoryPreview, type HistoryPreviewBlock } from './noteHistoryPreview'

function doc(content: BlockNode[]): BlockNode {
  return { type: 'doc', content }
}

describe('buildHistoryPreview', () => {
  it('reports checklist checked state', () => {
    const blocks = buildHistoryPreview(doc([
      { type: 'checklist_item', attrs: { checked: true }, content: [{ type: 'text', text: 'Done thing' }] },
      { type: 'checklist_item', attrs: { checked: false }, content: [{ type: 'text', text: 'Todo thing' }] },
    ]))

    expect(blocks[0]).toEqual({
      kind: 'checklist',
      checked: true,
      children: [{ kind: 'paragraph', runs: [{ kind: 'text', text: 'Done thing', marks: [] }] }],
    })
    expect(blocks[1]).toMatchObject({ kind: 'checklist', checked: false })
  })

  it('builds a nested bullet list', () => {
    const blocks = buildHistoryPreview(doc([
      {
        type: 'bullet_list',
        content: [
          {
            type: 'list_item',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Outer' }] },
              {
                type: 'bullet_list',
                content: [
                  {
                    type: 'list_item',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Inner' }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]))

    expect(blocks[0]).toMatchObject({ kind: 'list', ordered: false })
    const list = blocks[0] as Extract<HistoryPreviewBlock, { kind: 'list' }>
    expect(list.items).toHaveLength(1)
    expect(list.items[0]?.[0]).toEqual({ kind: 'paragraph', runs: [{ kind: 'text', text: 'Outer', marks: [] }] })
    const nested = list.items[0]?.[1] as Extract<HistoryPreviewBlock, { kind: 'list' }>
    expect(nested.kind).toBe('list')
    expect(nested.items[0]?.[0]).toEqual({ kind: 'paragraph', runs: [{ kind: 'text', text: 'Inner', marks: [] }] })
  })

  it('builds a callout with variant and children', () => {
    const blocks = buildHistoryPreview(doc([
      {
        type: 'callout',
        attrs: { variant: 'warning', icon: '⚠️' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Careful' }] }],
      },
    ]))

    expect(blocks[0]).toEqual({
      kind: 'callout',
      variant: 'warning',
      icon: '⚠️',
      children: [{ kind: 'paragraph', runs: [{ kind: 'text', text: 'Careful', marks: [] }] }],
    })
  })

  it('builds a table with a header row', () => {
    const blocks = buildHistoryPreview(doc([
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [
              { type: 'table_header', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] },
              { type: 'table_header', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Age' }] }] },
            ],
          },
          {
            type: 'table_row',
            content: [
              { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ada' }] }] },
              { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '36' }] }] },
            ],
          },
        ],
      },
    ]))

    const table = blocks[0] as Extract<HistoryPreviewBlock, { kind: 'table' }>
    expect(table.kind).toBe('table')
    expect(table.rows[0]?.[0]?.header).toBe(true)
    expect(table.rows[1]?.[0]?.header).toBe(false)
    expect(table.rows[1]?.[0]?.blocks).toEqual([{ kind: 'paragraph', runs: [{ kind: 'text', text: 'Ada', marks: [] }] }])
  })

  it('keeps a workspace-relative image src and marks a remote https image as external with a null src but the raw URL preserved as text', () => {
    const blocks = buildHistoryPreview(doc([
      { type: 'image_block', attrs: { src: '.nevo/assets/pic.png', alt: 'a', caption: 'c' } },
      { type: 'image_block', attrs: { src: 'https://example.com/pic.png', alt: 'b', caption: '' } },
    ]))

    expect(blocks[0]).toEqual({ kind: 'image', src: '.nevo/assets/pic.png', alt: 'a', caption: 'c', external: false, externalUrl: null })
    expect(blocks[1]).toEqual({ kind: 'image', src: null, alt: 'b', caption: '', external: true, externalUrl: 'https://example.com/pic.png' })
  })

  it('marks a javascript: image src as external with a null src but the raw URL preserved as text', () => {
    const blocks = buildHistoryPreview(doc([
      { type: 'image_block', attrs: { src: 'javascript:alert(1)', alt: '', caption: '' } },
    ]))

    expect(blocks[0]).toEqual({ kind: 'image', src: null, alt: '', caption: '', external: true, externalUrl: 'javascript:alert(1)' })
  })

  it('keeps a data:image src as non-external with no externalUrl', () => {
    const blocks = buildHistoryPreview(doc([
      { type: 'image_block', attrs: { src: 'data:image/png;base64,AAAA', alt: '', caption: '' } },
    ]))

    expect(blocks[0]).toMatchObject({ src: 'data:image/png;base64,AAAA', external: false, externalUrl: null })
  })

  it('produces a bold+link run carrying href', () => {
    const blocks = buildHistoryPreview(doc([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Nevo',
            marks: [{ type: 'strong' }, { type: 'link', attrs: { href: 'https://nevo.app' } }],
          },
        ],
      },
    ]))

    const paragraph = blocks[0] as Extract<HistoryPreviewBlock, { kind: 'paragraph' }>
    expect(paragraph.runs[0]).toEqual({
      kind: 'text',
      text: 'Nevo',
      marks: ['strong', 'link'],
      href: 'https://nevo.app',
    })
  })

  it('maps an unknown plugin block to unsupported with its collected text', () => {
    const blocks = buildHistoryPreview(doc([
      {
        type: 'plugin_x_block',
        attrs: { foo: 'bar' },
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'plugin body' }] }],
      },
    ]))

    expect(blocks[0]).toEqual({ kind: 'unsupported', type: 'plugin_x_block', text: 'plugin body' })
  })

  it('does not mutate the input document', () => {
    const input = doc([
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello', marks: [{ type: 'strong' }] }],
      },
      { type: 'image_block', attrs: { src: 'https://example.com/x.png' } },
    ])
    const copy = structuredClone(input)

    buildHistoryPreview(input)

    expect(input).toEqual(copy)
  })
})
