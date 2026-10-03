import { describe, expect, it } from 'vitest'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc, parseNoteContentToDocSafe, serializeDocToNoteContent } from '../serialization'
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
                    formula: null,
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
        {
          type: 'block_embed',
          attrs: { noteId: 'note-123', blockId: 'block-abc' },
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

describe('parseNoteContentToDocSafe', () => {
  it('reports degraded: false and the real doc for content the schema can parse', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    }

    const result = parseNoteContentToDocSafe(nevoBaseSchema, content)

    expect(result.degraded).toBe(false)
    expect(serializeDocToNoteContent(result.doc)).toEqual(content)
  })

  it('reports degraded: false for legitimate legacy shapes normalizeNoteContent fixes up', () => {
    const legacyContent: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'info', icon: '💡', text: 'legacy' },
          content: [{ type: 'text', text: 'Legacy callout' }],
        },
      ],
    }

    const result = parseNoteContentToDocSafe(nevoBaseSchema, legacyContent)

    expect(result.degraded).toBe(false)
  })

  it('reports degraded: true and a plain-text fallback doc for an unknown node type', () => {
    const content = {
      type: 'doc',
      content: [{ type: 'totally_unknown_block_type', attrs: { foo: 'bar' } }],
    }

    const result = parseNoteContentToDocSafe(nevoBaseSchema, content)

    expect(result.degraded).toBe(true)
    expect(result.doc.type.name).toBe('doc')
  })

  it('parseNoteContentToDoc keeps returning just the doc, matching prior behavior', () => {
    const content: BlockNode = { type: 'doc', content: [{ type: 'paragraph' }] }
    const doc = parseNoteContentToDoc(nevoBaseSchema, content)
    const safe = parseNoteContentToDocSafe(nevoBaseSchema, content)

    expect(serializeDocToNoteContent(doc)).toEqual(serializeDocToNoteContent(safe.doc))
  })
})
