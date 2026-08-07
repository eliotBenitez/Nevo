import { describe, expect, it } from 'vitest'
import {
  noteQueryFields,
  noteQueryFieldsForView,
  noteRowsToDbRecords,
  QUERY_FIELD_STATUS,
  QUERY_FIELD_TAGS,
  QUERY_FIELD_TITLE,
} from './noteQueryProjection'
import type { NoteRow } from '../../types/note-query'

const t = (key: string) => key

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

describe('noteQueryFields', () => {
  it('builds tag options from the rows actually present', () => {
    const rows = [row({ noteId: 'n1', tags: ['red', 'urgent'] }), row({ noteId: 'n2', tags: ['blue'] })]
    const fields = noteQueryFields(rows, t)
    const tagsField = fields.find((field) => field.id === QUERY_FIELD_TAGS)
    expect(tagsField?.options?.map((option) => option.id).sort()).toEqual(['blue', 'red', 'urgent'])
  })

  it('includes the full fixed status option set regardless of the rows present', () => {
    const fields = noteQueryFields([], t)
    const statusField = fields.find((field) => field.id === QUERY_FIELD_STATUS)
    expect(statusField?.options?.map((option) => option.id)).toEqual(['none', 'draft', 'active', 'waiting', 'done'])
  })

  it('keeps list results title-only so note properties are not rendered as metadata', () => {
    const fields = noteQueryFieldsForView([row({ noteId: 'n1', tags: ['red'], folderPath: 'Work' })], t, 'list')

    expect(fields.map((field) => field.id)).toEqual([QUERY_FIELD_TITLE])
  })

  it('keeps all projected fields available in table and cards views', () => {
    const tableFields = noteQueryFieldsForView([], t, 'table')
    const cardFields = noteQueryFieldsForView([], t, 'cards')

    expect(tableFields.map((field) => field.id)).toEqual(cardFields.map((field) => field.id))
    expect(tableFields.map((field) => field.id)).toContain(QUERY_FIELD_TAGS)
    expect(tableFields.map((field) => field.id)).toContain(QUERY_FIELD_STATUS)
  })
})

describe('noteRowsToDbRecords', () => {
  it('projects a note row into a DbRecord keyed by the query field ids', () => {
    const rows = [row({ noteId: 'n1', title: 'Alpha', icon: '📝', tags: ['red'], status: 'active', noteType: 'task', date: '2024-01-01', folderPath: 'Work' })]
    const records = noteRowsToDbRecords(rows)
    expect(records).toHaveLength(1)
    expect(records[0].id).toBe('n1')
    expect(records[0].cells[QUERY_FIELD_TITLE]).toBe('📝 Alpha')
    expect(records[0].cells[QUERY_FIELD_TAGS]).toEqual(['red'])
    expect(records[0].cells[QUERY_FIELD_STATUS]).toBe('active')
  })

  it('preserves null status/type/date rather than coercing them', () => {
    const records = noteRowsToDbRecords([row({ noteId: 'n1' })])
    expect(records[0].cells[QUERY_FIELD_STATUS]).toBeNull()
  })
})
