import { describe, expect, it } from 'vitest'
import { createNoteCache } from './noteCache'
import type { NoteDocument } from '../../types/note'

function note(id: string, text: string): NoteDocument {
  return {
    id,
    title: `Note ${id}`,
    icon: '📄',
    folderId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] },
  }
}

describe('createNoteCache', () => {
  it('the same note id in two different handles never collides', () => {
    const cache = createNoteCache()
    cache.set('local:/a', note('note-1', 'From workspace A'))
    cache.set('local:/b', note('note-1', 'From workspace B'))

    expect(cache.get('local:/a', 'note-1')?.content.content?.[0]?.content?.[0]?.text).toBe('From workspace A')
    expect(cache.get('local:/b', 'note-1')?.content.content?.[0]?.content?.[0]?.text).toBe('From workspace B')
  })

  it('returns undefined for a note never cached under that handle', () => {
    const cache = createNoteCache()
    cache.set('local:/a', note('note-1', 'A'))

    expect(cache.get('local:/b', 'note-1')).toBeUndefined()
  })

  it('delete only removes the entry for the given handle', () => {
    const cache = createNoteCache()
    cache.set('local:/a', note('note-1', 'A'))
    cache.set('local:/b', note('note-1', 'B'))

    cache.delete('local:/a', 'note-1')

    expect(cache.get('local:/a', 'note-1')).toBeUndefined()
    expect(cache.get('local:/b', 'note-1')).toBeDefined()
  })

  it('clearExcept drops every entry from other handles and keeps the given one', () => {
    const cache = createNoteCache()
    cache.set('local:/a', note('note-1', 'A1'))
    cache.set('local:/a', note('note-2', 'A2'))
    cache.set('local:/b', note('note-1', 'B1'))

    cache.clearExcept('local:/a')

    expect(cache.get('local:/a', 'note-1')).toBeDefined()
    expect(cache.get('local:/a', 'note-2')).toBeDefined()
    expect(cache.get('local:/b', 'note-1')).toBeUndefined()
  })

  it('evicts the least-recently-used entry once the limit is exceeded', () => {
    const cache = createNoteCache(2)
    cache.set('local:/a', note('note-1', '1'))
    cache.set('local:/a', note('note-2', '2'))
    cache.set('local:/a', note('note-3', '3'))

    expect(cache.get('local:/a', 'note-1')).toBeUndefined()
    expect(cache.get('local:/a', 'note-2')).toBeDefined()
    expect(cache.get('local:/a', 'note-3')).toBeDefined()
  })

  it('re-setting (touching) a note moves it to the most-recently-used end', () => {
    const cache = createNoteCache(2)
    cache.set('local:/a', note('note-1', '1'))
    cache.set('local:/a', note('note-2', '2'))
    // Touch note-1 again so note-2 becomes the least-recently-used one.
    cache.set('local:/a', note('note-1', '1-updated'))
    cache.set('local:/a', note('note-3', '3'))

    expect(cache.get('local:/a', 'note-2')).toBeUndefined()
    expect(cache.get('local:/a', 'note-1')?.content.content?.[0]?.content?.[0]?.text).toBe('1-updated')
    expect(cache.get('local:/a', 'note-3')).toBeDefined()
  })

  it('LRU eviction is scoped correctly across handles sharing the cache', () => {
    const cache = createNoteCache(2)
    cache.set('local:/a', note('note-1', 'a1'))
    cache.set('local:/b', note('note-1', 'b1'))
    cache.set('local:/a', note('note-2', 'a2'))

    // The cache-wide limit is 2 entries total, so the oldest (local:/a note-1)
    // was evicted regardless of which handle it belonged to.
    expect(cache.get('local:/a', 'note-1')).toBeUndefined()
    expect(cache.get('local:/b', 'note-1')).toBeDefined()
    expect(cache.get('local:/a', 'note-2')).toBeDefined()
  })
})
