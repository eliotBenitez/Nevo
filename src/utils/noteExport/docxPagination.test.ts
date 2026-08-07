import { describe, expect, it } from 'vitest'
import {
  paginateTableRows,
  processedNodeText,
  splitProcessedNodeAt,
  textBreakOffsets,
  type ProcessedNode,
} from './docxPagination'

describe('docxPagination', () => {
  it('splits formatted text without losing marks or surrounding structure', () => {
    const node: ProcessedNode = {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'plain ' },
        { type: 'text', text: 'bold words', marks: [{ type: 'strong' }] },
        { type: 'text', text: ' tail', marks: [{ type: 'em' }] },
      ],
    }

    const split = splitProcessedNodeAt(node, 12)

    expect(processedNodeText(split.before!)).toBe('plain bold w')
    expect(processedNodeText(split.after!)).toBe('ords tail')
    expect(split.before?.content?.[1]?.marks).toEqual([{ type: 'strong' }])
    expect(split.after?.content?.[0]?.marks).toEqual([{ type: 'strong' }])
    expect(split.after?.content?.[1]?.marks).toEqual([{ type: 'em' }])
  })

  it('provides grapheme boundaries for an unbreakable word', () => {
    const text = 'superlong🚀word'
    const { graphemes } = textBreakOffsets(text)

    expect(graphemes[graphemes.length - 1]).toBe(text.length)
    expect(graphemes).not.toContain(text.indexOf('🚀') + 1)
    expect(graphemes).toContain(text.indexOf('🚀') + 2)
  })

  it('preserves a single list item wrapper on both sides of a split', () => {
    const node: ProcessedNode = {
      type: 'ordered_list',
      attrs: { start: 3 },
      content: [{
        type: 'list_item',
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: 'one two three four' }],
        }],
      }],
    }

    const split = splitProcessedNodeAt(node, 8)

    expect(split.before?.type).toBe('ordered_list')
    expect(split.after?.type).toBe('ordered_list')
    expect(split.before?.attrs?.start).toBe(3)
    expect(split.after?.attrs?.start).toBe(3)
    expect(processedNodeText(split.before!)).toBe('one two ')
    expect(processedNodeText(split.after!)).toBe('three four')
  })

  it('splits a table by measured rows and repeats its header', () => {
    const table: ProcessedNode = {
      type: 'table',
      content: [
        {
          type: 'table_row',
          content: [{ type: 'table_header', content: [{ type: 'text', text: 'Head' }] }],
        },
        {
          type: 'table_row',
          content: [{ type: 'table_cell', content: [{ type: 'text', text: 'One' }] }],
        },
        {
          type: 'table_row',
          content: [{ type: 'table_cell', content: [{ type: 'text', text: 'Two' }] }],
        },
        {
          type: 'table_row',
          content: [{ type: 'table_cell', content: [{ type: 'text', text: 'Three' }] }],
        },
      ],
    }

    const result = paginateTableRows(table, [30, 30, 30, 30], 2, 75, 100)

    expect(result?.startsOnNextPage).toBe(false)
    expect(result?.fragments).toHaveLength(2)
    expect(result?.fragments.map(fragment => fragment.height)).toEqual([62, 92])
    expect(result?.fragments[0].node.content).toHaveLength(2)
    expect(result?.fragments[1].node.content).toHaveLength(3)
    expect(processedNodeText(result!.fragments[0].node)).toBe('HeadOne')
    expect(processedNodeText(result!.fragments[1].node)).toBe('HeadTwoThree')
    expect(result?.fragments[0].node.continuesOnNextPage).toBe(true)
    expect(result?.fragments[1].node.continuesFromPreviousPage).toBe(true)
  })

  it('moves a table before splitting when its header and first row do not fit', () => {
    const table: ProcessedNode = {
      type: 'table',
      content: [
        {
          type: 'table_row',
          content: [{ type: 'table_header', content: [{ type: 'text', text: 'Head' }] }],
        },
        {
          type: 'table_row',
          content: [{ type: 'table_cell', content: [{ type: 'text', text: 'One' }] }],
        },
      ],
    }

    const result = paginateTableRows(table, [30, 30], 2, 40, 100)

    expect(result?.startsOnNextPage).toBe(true)
    expect(result?.fragments).toHaveLength(1)
    expect(result?.fragments[0].height).toBe(62)
  })
})
