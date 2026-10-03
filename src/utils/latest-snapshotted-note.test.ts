import { describe, expect, it } from 'vitest'
import { latestSnapshottedNoteId } from './latest-snapshotted-note'
import type { NoteSnapshotsEntry } from '../types/note'

function entry(noteId: string, ...createdAt: string[]): NoteSnapshotsEntry {
  return {
    noteId,
    snapshots: createdAt.map((value, index) => ({
      id: `${noteId}-${index}`,
      noteId,
      createdAt: value,
      updatedAt: value,
    })),
  }
}

describe('latestSnapshottedNoteId', () => {
  it('returns null when nothing has been snapshotted', () => {
    expect(latestSnapshottedNoteId([])).toBeNull()
    expect(latestSnapshottedNoteId([entry('note-a')])).toBeNull()
  })

  it('picks the note holding the single newest snapshot, not the longest list', () => {
    const entries = [
      entry('note-a', '2026-09-01T10:00:00.000Z', '2026-09-02T10:00:00.000Z', '2026-09-03T10:00:00.000Z'),
      entry('note-b', '2026-09-20T10:00:00.000Z'),
    ]

    expect(latestSnapshottedNoteId(entries)).toBe('note-b')
  })

  it('is unaffected by the order entries arrive in', () => {
    const newest = entry('note-b', '2026-09-20T10:00:00.000Z')
    const older = entry('note-a', '2026-09-03T10:00:00.000Z')

    expect(latestSnapshottedNoteId([newest, older])).toBe('note-b')
    expect(latestSnapshottedNoteId([older, newest])).toBe('note-b')
  })
})
