// Frontend mirror of the Rust `note_index` query contract
// (`src-tauri/src/commands/note_index/query.rs`). Field names must stay in sync
// with the serde `camelCase` structs there. Consumed by the Query/Dataview block
// via the workspace backend (`queryNotes`).

import type { NoteType, NoteStatus } from './note'

/** One note as returned by the `query_notes` command. */
export interface NoteRow {
  noteId: string
  title: string
  icon: string
  folderId: string | null
  folderPath: string
  noteType: NoteType | null
  status: NoteStatus | null
  date: string | null
  createdAt: string
  updatedAt: string
  tags: string[]
}

export type NoteSortField = 'title' | 'date' | 'updatedAt' | 'createdAt'
export type NoteSortDirection = 'asc' | 'desc'

export interface NoteSortRule {
  field: NoteSortField
  direction: NoteSortDirection
}

/**
 * Cross-note filter set. All fields are optional/empty-by-default; empty
 * collections and null scalars mean "no constraint". Multiple constraints are
 * combined with AND (matching the Rust `build_where`).
 */
export interface NoteQueryFilters {
  /** Match notes carrying at least one of these tags. */
  tagsAny: string[]
  /** Match notes carrying every one of these tags. */
  tagsAll: string[]
  status: NoteStatus | null
  noteType: NoteType | null
  /** Inclusive ISO-date (`YYYY-MM-DD`) lower bound, lexicographic. */
  dateFrom: string | null
  /** Inclusive ISO-date upper bound. */
  dateTo: string | null
  folderId: string | null
  /** Folder path like `Parent` or `Parent / Child`. */
  folderPathPrefix: string | null
  /** When true, also match descendants of `folderPathPrefix`. */
  includeSubtree: boolean
}

export interface NoteQueryRequest {
  filters: NoteQueryFilters
  sorts: NoteSortRule[]
}

/** A neutral default request: no filters, no sorts (returns every note). */
export function emptyNoteQueryFilters(): NoteQueryFilters {
  return {
    tagsAny: [],
    tagsAll: [],
    status: null,
    noteType: null,
    dateFrom: null,
    dateTo: null,
    folderId: null,
    folderPathPrefix: null,
    includeSubtree: false,
  }
}
