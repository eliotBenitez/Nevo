import { describe, expect, it } from 'vitest'
import type { BlockNode } from '../types/note'
import { countWordsInNoteContent, countWordsInText, noteContentToWordCountText } from './noteWordCount'

function note(content: BlockNode[]): BlockNode {
  return { type: 'doc', content }
}

describe('noteWordCount', () => {
  it('keeps adjacent text fragments inside one formatted word together', () => {
    const content = note([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'про', marks: [{ type: 'strong' }] },
          { type: 'text', text: 'ект' },
        ],
      },
    ])

    expect(noteContentToWordCountText(content)).toBe('проект')
    expect(countWordsInNoteContent(content)).toBe(1)
  })

  it('separates words in adjacent blocks and hard breaks', () => {
    const content = note([
      { type: 'paragraph', content: [{ type: 'text', text: 'Первый' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'второй' }, { type: 'hard_break' }, { type: 'text', text: 'третий' }] },
    ])

    expect(noteContentToWordCountText(content)).toBe('Первый\nвторой\nтретий')
    expect(countWordsInNoteContent(content)).toBe(3)
  })

  it('separates nested block content such as list items and table cells', () => {
    const content = note([
      {
        type: 'bullet_list',
        content: [
          { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
          { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
        ],
      },
      {
        type: 'table',
        content: [{
          type: 'table_row',
          content: [
            { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'three' }] }] },
            { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'four' }] }] },
          ],
        }],
      },
    ])

    expect(countWordsInNoteContent(content)).toBe(4)
  })

  it('uses the same whitespace rule for live editor text', () => {
    expect(countWordsInText('Первый\nвторой\nтретий')).toBe(3)
  })
})
