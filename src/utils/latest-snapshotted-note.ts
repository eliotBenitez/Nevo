import type { NoteSnapshotsEntry } from '../types/note'

/**
 * The note whose newest snapshot is the most recent of all.
 *
 * History is a per-note route, but the sidebar and titlebar entries stay visible on
 * Home where no note is open. Without this fallback those buttons would do nothing.
 */
export function latestSnapshottedNoteId(entries: NoteSnapshotsEntry[]): string | null {
  let bestNoteId: string | null = null
  let bestCreatedAt = ''

  for (const entry of entries) {
    for (const snapshot of entry.snapshots) {
      if (snapshot.createdAt > bestCreatedAt) {
        bestCreatedAt = snapshot.createdAt
        bestNoteId = entry.noteId
      }
    }
  }

  return bestNoteId
}
