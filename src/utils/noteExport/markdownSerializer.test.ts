import { describe, expect, it } from 'vitest'
import { serializeNoteToMarkdown } from './markdownSerializer'
import type { NoteDocument } from '../../types/note'

function noteWith(content: unknown): NoteDocument {
  return {
    id: 'n1',
    title: 'Test',
    icon: '📄',
    folderId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content: { type: 'doc', content: content as any } as any,
  }
}

describe('serializeNoteToMarkdown — internal_link', () => {
  it('emits [[Title]] when there is no alias', () => {
    const note = noteWith([{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Ideas',
        marks: [{ type: 'internal_link', attrs: { noteId: 'id-1', title: 'Ideas', anchor: null, alias: null } }],
      }],
    }])
    expect(serializeNoteToMarkdown(note, 'assets').markdown).toContain('[[Ideas]]')
  })

  it('emits [[Title|Alias]] when an alias differs from the visible text', () => {
    const note = noteWith([{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'my note',
        marks: [{ type: 'internal_link', attrs: { noteId: 'id-1', title: 'Ideas', anchor: null, alias: 'my note' } }],
      }],
    }])
    expect(serializeNoteToMarkdown(note, 'assets').markdown).toContain('[[Ideas|my note]]')
  })

  it('falls back to visible text when title is missing (legacy links)', () => {
    const note = noteWith([{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Visible',
        marks: [{ type: 'internal_link', attrs: { noteId: 'id-1', anchor: null, title: null, alias: null } }],
      }],
    }])
    expect(serializeNoteToMarkdown(note, 'assets').markdown).toContain('[[Visible]]')
  })

  it('omits the alias form when the alias equals the target title', () => {
    const note = noteWith([{
      type: 'paragraph',
      content: [{
        type: 'text',
        text: 'Ideas',
        marks: [{ type: 'internal_link', attrs: { noteId: 'id-1', title: 'Ideas', anchor: null, alias: 'Ideas' } }],
      }],
    }])
    // alias === title → no `|alias` suffix, just [[Ideas]]
    expect(serializeNoteToMarkdown(note, 'assets').markdown).toContain('[[Ideas]]')
    expect(serializeNoteToMarkdown(note, 'assets').markdown).not.toContain('[[Ideas|')
  })
})
