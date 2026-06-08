import { describe, expect, it } from 'vitest'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc, serializeDocToNoteContent } from '../serialization'
import type { BlockNode } from '../../types/note'

describe('serialization compatibility', () => {
  it('round-trips rich block content and links', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'info', icon: '💡' },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Remember this' }] },
            { type: 'bullet_list', content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested point' }] }] }] },
          ],
        },
        {
          type: 'checklist_item',
          attrs: { checked: true },
          content: [{ type: 'text', text: 'Done task' }],
        },
        {
          type: 'divider',
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Nevo',
              marks: [{ type: 'link', attrs: { href: 'https://nevo.app', title: null } }],
            },
          ],
        },
        {
          type: 'math_block',
          attrs: { latex: '\\\\int_0^1 x^2 dx', displayMode: true },
        },
        {
          type: 'paragraph',
          content: [{ type: 'math_inline', attrs: { latex: 'x^2 + y^2', displayMode: false } }],
        },
        {
          type: 'table',
          content: [
            {
              type: 'table_row',
              content: [
                {
                  type: 'table_header',
                  attrs: {
                    colspan: 1,
                    rowspan: 1,
                    colwidth: null,
                    align: 'center',
                    background: 'oklch(0.95 0.04 90)',
                    borderColor: null,
                    textColor: null,
                    padding: null,
                  },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Head' }] }],
                },
              ],
            },
          ],
        },
        {
          type: 'image_block',
          attrs: { src: '.nevo/assets/image.png', alt: 'sample', caption: 'caption', sizePreset: 'medium', width: null, align: 'center' },
        },
        {
          type: 'code_block',
          attrs: { language: 'typescript' },
          content: [{ type: 'text', text: 'const value = 42' }],
        },
      ],
    }

    const doc = parseNoteContentToDoc(nevoBaseSchema, content)
    const serialized = serializeDocToNoteContent(doc)
    expect(serialized).toEqual(content)
  })

  it('keeps compatibility with old plain-text payloads', () => {
    const doc = parseNoteContentToDoc(nevoBaseSchema, 'legacy line')
    const serialized = serializeDocToNoteContent(doc)

    expect(serialized.type).toBe('doc')
    expect(serialized.content?.[0]?.type).toBe('paragraph')
  })

  it('normalizes legacy callouts with inline or empty content', () => {
    const legacyContent: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'info', icon: '💡', text: 'legacy' },
          content: [{ type: 'text', text: 'Legacy callout' }],
        },
        {
          type: 'callout',
          attrs: { variant: 'warning', icon: '⚠️', text: '' },
          content: [],
        },
      ],
    }

    const serialized = serializeDocToNoteContent(parseNoteContentToDoc(nevoBaseSchema, legacyContent))

    expect(serialized).toEqual({
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'info', icon: '💡' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Legacy callout' }] }],
        },
        {
          type: 'callout',
          attrs: { variant: 'warning', icon: '⚠️' },
          content: [{ type: 'paragraph' }],
        },
      ],
    })
  })
})
