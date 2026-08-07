import { describe, expect, it } from 'vitest'
import {
  buildMatchSnippet,
  flattenBlockText,
  flattenNoteBlocks,
  searchBlocks,
  textSearchScore,
  MAX_BLOCK_SEARCH_RESULTS,
  type BlockSearchSource,
} from './blockSearch'
import type { BlockNode } from '../../types/note'

const paragraph = (text: string): BlockNode => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
})

const source = (noteId: string, blocks: string[], noteTitle = noteId): BlockSearchSource =>
  ({ noteId, noteTitle, folderId: null, blocks })

describe('flattenNoteBlocks', () => {
  it('returns one trimmed entry per top-level block, dropping empty ones', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        paragraph('  first  '),
        { type: 'paragraph' },
        paragraph('second'),
      ],
    }
    expect(flattenNoteBlocks(content)).toEqual(['first', 'second'])
  })

  it('walks nested content and turns hard breaks into newlines', () => {
    const node: BlockNode = {
      type: 'callout',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hard_break' }, { type: 'text', text: 'b' }] },
      ],
    }
    expect(flattenBlockText(node)).toBe('a\nb')
  })

  it('reads the searchable attributes of embed-style nodes', () => {
    expect(flattenBlockText({ type: 'note_embed', attrs: { title: 'Linked', previewText: 'body' } }))
      .toBe('Linked body')
    expect(flattenBlockText({ type: 'properties_block', attrs: { status: 'active', tags: 'x', owner: '' } }))
      .toBe('active x')
  })

  it('tolerates a note with no content', () => {
    expect(flattenNoteBlocks(undefined)).toEqual([])
    expect(flattenNoteBlocks({ type: 'doc' })).toEqual([])
  })
})

describe('textSearchScore', () => {
  it('ranks a prefix above a later substring above a fuzzy match', () => {
    const prefix = textSearchScore('alpha', 'alpha beta')!
    const substring = textSearchScore('alpha', 'beta alpha')!
    const fuzzy = textSearchScore('alpha', 'a long path here again')!
    expect(prefix).toBeGreaterThan(substring)
    expect(substring).toBeGreaterThan(fuzzy)
  })

  it('is case- and whitespace-insensitive', () => {
    expect(textSearchScore('  ALPHA ', 'Alpha beta')).toBe(textSearchScore('alpha', 'alpha beta'))
  })

  it('returns null when the query is not a subsequence, or either side is empty', () => {
    expect(textSearchScore('zzz', 'alpha beta')).toBeNull()
    expect(textSearchScore('', 'alpha')).toBeNull()
    expect(textSearchScore('alpha', '   ')).toBeNull()
  })
})

describe('buildMatchSnippet', () => {
  it('returns the whole block when the match window covers it', () => {
    expect(buildMatchSnippet('Leading context alpha trailing context', 'alpha'))
      .toBe('Leading context alpha trailing context')
  })

  it('ellipsises a window around a match deep in a long block', () => {
    const long = `${'x'.repeat(200)} alpha ${'y'.repeat(200)}`
    const snippet = buildMatchSnippet(long, 'alpha')
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
    expect(snippet).toContain('alpha')
    expect(snippet.length).toBeLessThan(long.length)
  })

  it('falls back to a leading excerpt when the query does not appear literally', () => {
    const long = 'z'.repeat(200)
    expect(buildMatchSnippet(long, 'alpha')).toBe(`${'z'.repeat(96)}…`)
    expect(buildMatchSnippet('short block', 'alpha')).toBe('short block')
  })
})

describe('searchBlocks', () => {
  // Mirrors the Rust test `search_workspace_blocks_returns_block_metadata_and_snippet`.
  it('reports note title, block index, snippet and full block text', () => {
    const results = searchBlocks(
      [source('note-1', ['Leading context alpha trailing context'], 'Snippet note')],
      'alpha',
    )

    expect(results).toHaveLength(1)
    expect(results[0].noteTitle).toBe('Snippet note')
    expect(results[0].blockIndex).toBe(0)
    expect(results[0].snippet.toLowerCase()).toContain('alpha')
    expect(results[0].blockText).toContain('Leading context')
  })

  it('indexes block positions so a match points at the right block', () => {
    const results = searchBlocks([source('note-1', ['intro', 'the alpha block', 'outro'])], 'alpha')
    expect(results.map(r => r.blockIndex)).toEqual([1])
  })

  it('returns nothing for a blank query', () => {
    expect(searchBlocks([source('note-1', ['alpha'])], '   ')).toEqual([])
  })

  it('orders by score, then note title, then block index', () => {
    const results = searchBlocks(
      [
        source('b', ['nothing here', 'trailing alpha mention'], 'B note'),
        source('a', ['alpha leads this block'], 'A note'),
      ],
      'alpha',
    )
    // The prefix match outranks the mid-block one regardless of input order.
    expect(results[0].noteId).toBe('a')
    expect(results[1].noteId).toBe('b')
  })

  it('caps the number of results', () => {
    const blocks = Array.from({ length: 50 }, (_, index) => `alpha ${index}`)
    expect(searchBlocks([source('note-1', blocks)], 'alpha'))
      .toHaveLength(MAX_BLOCK_SEARCH_RESULTS)
  })
})
