import { describe, expect, it } from 'vitest'
import type { Node as ProseMirrorNode } from 'prosemirror-model'
import { nevoBaseSchema } from '../schema'
import { countWordsInText } from '../../utils/noteWordCount'
import { computeDocStats } from '../docStats'

/**
 * Reference oracle: exactly what `useEditorDocStats.ts` computed before this
 * change (two full-document walks materialized into strings). Every fixture
 * below is checked against this, not against hand-computed numbers, so the
 * test verifies `computeDocStats` faithfully replicates
 * `Fragment.textBetween`'s block-separator/leaf-text semantics rather than a
 * hand-derived approximation of them.
 */
function oldStats(doc: ProseMirrorNode) {
  const docText = doc.textContent
  const wordText = doc.textBetween(0, doc.content.size, '\n', '\n')
  return { chars: docText.length, words: countWordsInText(wordText) }
}

function doc(content: unknown) {
  return nevoBaseSchema.nodeFromJSON({ type: 'doc', content })
}

function expectParity(node: ProseMirrorNode) {
  expect(computeDocStats(node)).toEqual(oldStats(node))
}

describe('computeDocStats', () => {
  it('matches the old two-pass computation for an empty document', () => {
    const node = doc([{ type: 'paragraph' }])
    expectParity(node)
    expect(computeDocStats(node)).toEqual({ chars: 0, words: 0 })
  })

  it('matches for plain paragraphs, without merging words across blocks', () => {
    const node = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'Первый' }] },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'про', marks: [{ type: 'strong' }] },
          { type: 'text', text: 'ект' },
        ],
      },
    ])
    expectParity(node)
    expect(computeDocStats(node)).toEqual({ words: 2, chars: 12 })
  })

  it('matches when adjacent blocks have no trailing space: chars concatenate, words stay separate', () => {
    const node = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'end' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'start' }] },
    ])
    expectParity(node)
    // Block boundaries are not characters (textContent has no separator) but
    // are still word boundaries.
    expect(computeDocStats(node)).toEqual({ chars: 8, words: 2 })
  })

  it('matches for nested lists', () => {
    const node = doc([
      {
        type: 'bullet_list',
        content: [
          {
            type: 'list_item',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'one' }] },
              {
                type: 'bullet_list',
                content: [
                  { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'nested two' }] }] },
                ],
              },
            ],
          },
          { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'three' }] }] },
        ],
      },
    ])
    expectParity(node)
  })

  it('matches for a table with multiple cells', () => {
    const node = doc([
      {
        type: 'table',
        content: [
          {
            type: 'table_row',
            content: [
              { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'alpha' }] }] },
              { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'beta' }] }] },
            ],
          },
        ],
      },
    ])
    expectParity(node)
  })

  it('matches for a code block', () => {
    const node = doc([
      { type: 'code_block', content: [{ type: 'text', text: 'const x = 1\nconst y = 2' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
    ])
    expectParity(node)
  })

  it('matches with an inline math atom inside a paragraph', () => {
    const node = doc([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'value ' },
          { type: 'math_inline', attrs: { latex: 'x^2' } },
          { type: 'text', text: ' end' },
        ],
      },
    ])
    expectParity(node)
  })

  it('matches with a hard break inside a single paragraph', () => {
    const node = doc([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'end' },
          { type: 'hard_break' },
          { type: 'text', text: 'start' },
        ],
      },
    ])
    expectParity(node)
  })

  it('matches with a block-level atom (divider) between paragraphs', () => {
    const node = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
      { type: 'divider' },
      { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
    ])
    expectParity(node)
  })

  it('matches when an atom is the very first content in the document', () => {
    const node = doc([
      { type: 'divider' },
      { type: 'paragraph', content: [{ type: 'text', text: 'after divider' }] },
    ])
    expectParity(node)
  })
})
