import { describe, expect, it } from 'vitest'
import { filterAndSortNotes } from './noteQueryFilter'
import { emptyNoteQueryFilters, type NoteQueryRequest, type NoteRow } from '../../types/note-query'

function row(overrides: Partial<NoteRow> & { noteId: string }): NoteRow {
  return {
    title: 'Untitled',
    icon: '📄',
    folderId: null,
    folderPath: '',
    noteType: null,
    status: null,
    date: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    tags: [],
    ...overrides,
  }
}

function request(overrides: Partial<NoteQueryRequest['filters']> = {}, sorts: NoteQueryRequest['sorts'] = []): NoteQueryRequest {
  return { filters: { ...emptyNoteQueryFilters(), ...overrides }, sorts }
}

describe('filterAndSortNotes', () => {
  it('filters by tagsAny (matches any) and tagsAll (matches every)', () => {
    const rows = [
      row({ noteId: 'n1', tags: ['red', 'urgent'] }),
      row({ noteId: 'n2', tags: ['blue'] }),
      row({ noteId: 'n3', tags: ['red'] }),
    ]

    const anyResult = filterAndSortNotes(rows, request({ tagsAny: ['red'] }))
    expect(anyResult.map((r) => r.noteId).sort()).toEqual(['n1', 'n3'])

    const allResult = filterAndSortNotes(rows, request({ tagsAll: ['red', 'urgent'] }))
    expect(allResult.map((r) => r.noteId)).toEqual(['n1'])
  })

  it('filters by status and note type (exact match)', () => {
    const rows = [
      row({ noteId: 'n1', noteType: 'task', status: 'active' }),
      row({ noteId: 'n2', noteType: 'idea', status: 'done' }),
    ]
    const result = filterAndSortNotes(rows, request({ status: 'active', noteType: 'task' }))
    expect(result.map((r) => r.noteId)).toEqual(['n1'])
  })

  it('filters by inclusive date range, excluding rows with no date', () => {
    const rows = [
      row({ noteId: 'n1', date: '2024-01-10' }),
      row({ noteId: 'n2', date: '2024-02-10' }),
      row({ noteId: 'n3', date: '2024-03-10' }),
      row({ noteId: 'n4', date: null }),
    ]
    const result = filterAndSortNotes(rows, request({ dateFrom: '2024-01-15', dateTo: '2024-02-28' }))
    expect(result.map((r) => r.noteId)).toEqual(['n2'])
  })

  it('filters by folder path: exact match, or subtree when includeSubtree is set', () => {
    const rows = [
      row({ noteId: 'n1', folderPath: '' }),
      row({ noteId: 'n2', folderPath: 'Parent' }),
      row({ noteId: 'n3', folderPath: 'Parent / Child' }),
    ]

    const exact = filterAndSortNotes(rows, request({ folderPathPrefix: 'Parent', includeSubtree: false }))
    expect(exact.map((r) => r.noteId)).toEqual(['n2'])

    const subtree = filterAndSortNotes(rows, request({ folderPathPrefix: 'Parent', includeSubtree: true }))
    expect(subtree.map((r) => r.noteId).sort()).toEqual(['n2', 'n3'])
  })

  it('filters by folderId (exact match)', () => {
    const rows = [
      row({ noteId: 'n1', folderId: 'fa' }),
      row({ noteId: 'n2', folderId: 'fb' }),
    ]
    const result = filterAndSortNotes(rows, request({ folderId: 'fb' }))
    expect(result.map((r) => r.noteId)).toEqual(['n2'])
  })

  it('combines multiple filters with AND', () => {
    const rows = [
      row({ noteId: 'n1', tags: ['red'], status: 'active' }),
      row({ noteId: 'n2', tags: ['red'], status: 'done' }),
    ]
    const result = filterAndSortNotes(rows, request({ tagsAny: ['red'], status: 'active' }))
    expect(result.map((r) => r.noteId)).toEqual(['n1'])
  })

  it('sorts ascending and descending by title', () => {
    const rows = [
      row({ noteId: 'n1', title: 'Banana' }),
      row({ noteId: 'n2', title: 'Apple' }),
      row({ noteId: 'n3', title: 'Cherry' }),
    ]

    const ascending = filterAndSortNotes(rows, request({}, [{ field: 'title', direction: 'asc' }]))
    expect(ascending.map((r) => r.title)).toEqual(['Apple', 'Banana', 'Cherry'])

    const descending = filterAndSortNotes(rows, request({}, [{ field: 'title', direction: 'desc' }]))
    expect(descending.map((r) => r.title)).toEqual(['Cherry', 'Banana', 'Apple'])
  })

  it('sorts with NULLS LAST regardless of direction', () => {
    const rows = [
      row({ noteId: 'n1', date: '2024-01-01' }),
      row({ noteId: 'n2', date: null }),
      row({ noteId: 'n3', date: '2024-03-01' }),
    ]
    const ascending = filterAndSortNotes(rows, request({}, [{ field: 'date', direction: 'asc' }]))
    expect(ascending.map((r) => r.noteId)).toEqual(['n1', 'n3', 'n2'])

    const descending = filterAndSortNotes(rows, request({}, [{ field: 'date', direction: 'desc' }]))
    expect(descending.map((r) => r.noteId)).toEqual(['n3', 'n1', 'n2'])
  })

  it('applies multi-key sort as a tiebreaker chain', () => {
    const rows = [
      row({ noteId: 'n1', status: 'active', title: 'Beta' }),
      row({ noteId: 'n2', status: 'active', title: 'Alpha' }),
      row({ noteId: 'n3', status: 'done', title: 'Zeta' }),
    ]
    const result = filterAndSortNotes(rows, request({}, [
      { field: 'createdAt', direction: 'asc' },
      { field: 'title', direction: 'asc' },
    ]))
    // All share the same createdAt, so title is the effective tiebreaker.
    expect(result.map((r) => r.noteId)).toEqual(['n2', 'n1', 'n3'])
  })

  it('returns all rows unsorted when no sorts are requested', () => {
    const rows = [row({ noteId: 'n1' }), row({ noteId: 'n2' })]
    const result = filterAndSortNotes(rows, request())
    expect(result.map((r) => r.noteId)).toEqual(['n1', 'n2'])
  })
})
