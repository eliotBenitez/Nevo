import { describe, expect, it } from 'vitest'
import type { NoteDocument } from '../types/note'
import {
  buildNoteHistoryDiff,
  filterHistoryFiles,
  pickInitialHistoryNoteId,
  type HistoryFileListItem,
} from './noteHistory'

function createNote(overrides: Partial<NoteDocument> = {}): NoteDocument {
  return {
    id: 'note-1',
    title: 'Note 1',
    icon: '📄',
    folderId: null,
    createdAt: '2026-05-14T10:00:00.000Z',
    updatedAt: '2026-05-14T11:00:00.000Z',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'First paragraph' }],
        },
      ],
    },
    ...overrides,
  }
}

describe('pickInitialHistoryNoteId', () => {
  it('prefers the explicit preselected note when it has history', () => {
    expect(
      pickInitialHistoryNoteId(['note-1', 'note-2'], {
        preselectedNoteId: 'note-2',
        activeNoteId: 'note-1',
      }),
    ).toBe('note-2')
  })

  it('falls back to the active note, then to the first note with history', () => {
    expect(
      pickInitialHistoryNoteId(['note-1', 'note-2'], {
        preselectedNoteId: 'missing',
        activeNoteId: 'note-2',
      }),
    ).toBe('note-2')

    expect(
      pickInitialHistoryNoteId(['note-3', 'note-4'], {
        preselectedNoteId: null,
        activeNoteId: 'missing',
      }),
    ).toBe('note-3')
  })

  it('returns null when no files have history', () => {
    expect(
      pickInitialHistoryNoteId([], {
        preselectedNoteId: 'note-1',
        activeNoteId: 'note-2',
      }),
    ).toBeNull()
  })
})

describe('filterHistoryFiles', () => {
  const files: HistoryFileListItem[] = [
    {
      id: 'note-1',
      title: 'Project Alpha',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-05-14T10:00:00.000Z',
      snapshotCount: 3,
      latestSnapshotAt: '2026-05-14T11:00:00.000Z',
    },
    {
      id: 'note-2',
      title: 'Research Notes',
      icon: '🧪',
      folderId: 'folder-1',
      updatedAt: '2026-05-13T10:00:00.000Z',
      snapshotCount: 1,
      latestSnapshotAt: '2026-05-13T11:00:00.000Z',
    },
  ]

  it('returns all files for an empty query', () => {
    expect(filterHistoryFiles(files, '')).toEqual(files)
  })

  it('matches titles case-insensitively', () => {
    expect(filterHistoryFiles(files, 'research').map(file => file.id)).toEqual(['note-2'])
  })
})

describe('buildNoteHistoryDiff', () => {
  it('reports top-level metadata changes without inventing content changes', () => {
    const snapshot = createNote()
    const current = createNote({
      title: 'Renamed note',
      icon: '🔥',
      cover: 'image:cover.png',
    })

    const diff = buildNoteHistoryDiff(current, snapshot)

    expect(diff.metadata).toEqual([
      {
        field: 'title',
        currentValue: 'Renamed note',
        snapshotValue: 'Note 1',
      },
      {
        field: 'icon',
        currentValue: '🔥',
        snapshotValue: '📄',
      },
      {
        field: 'cover',
        currentValue: 'image:cover.png',
        snapshotValue: null,
      },
    ])
    expect(diff.rows).toEqual([])
  })

  it('classifies paragraph additions, removals, and changed blocks', () => {
    const snapshot = createNote({
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Snapshot only paragraph' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Stable anchor' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Needs rewrite' }] },
        ],
      },
    })
    const current = createNote({
      content: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Alpha' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Stable anchor' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Rewritten paragraph' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Current only paragraph' }] },
        ],
      },
    })

    const diff = buildNoteHistoryDiff(current, snapshot)

    expect(diff.rows.map(row => row.kind)).toEqual(['removed', 'changed', 'added'])
    expect(diff.rows[0]).toMatchObject({
      kind: 'removed',
      snapshot: { label: 'Snapshot only paragraph' },
      current: null,
    })
    expect(diff.rows[1]).toMatchObject({
      kind: 'changed',
      snapshot: { label: 'Needs rewrite' },
      current: { label: 'Rewritten paragraph' },
    })
    expect(diff.rows[2]).toMatchObject({
      kind: 'added',
      snapshot: null,
      current: { label: 'Current only paragraph' },
    })
  })

  it('uses stable fallback labels for complex blocks', () => {
    const snapshot = createNote({
      content: {
        type: 'doc',
        content: [
          {
            type: 'table',
            content: [],
          },
        ],
      },
    })
    const current = createNote({
      content: {
        type: 'doc',
        content: [
          {
            type: 'table',
            attrs: { columns: 3 },
            content: [],
          },
        ],
      },
    })

    const diff = buildNoteHistoryDiff(current, snapshot)

    expect(diff.rows).toHaveLength(1)
    expect(diff.rows[0]).toMatchObject({
      kind: 'changed',
      snapshot: { label: 'Table block' },
      current: { label: 'Table block' },
    })
  })
})
