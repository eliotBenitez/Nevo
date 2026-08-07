// Client-side mirror of the Rust `build_where`/`build_order_by` query semantics
// (`src-tauri/src/commands/note_index/query.rs`). Used by the cloud workspace
// backend, which has no SQLite note index and must filter/sort in JS instead.
// Keep this in sync with the Rust implementation's tests.

import type { NoteQueryRequest, NoteRow, NoteSortField } from '../../types/note-query'

function matchesTagsAny(row: NoteRow, tagsAny: string[]): boolean {
  if (tagsAny.length === 0) return true
  return row.tags.some((tag) => tagsAny.includes(tag))
}

function matchesTagsAll(row: NoteRow, tagsAll: string[]): boolean {
  return tagsAll.every((tag) => row.tags.includes(tag))
}

function matchesFolderPathPrefix(row: NoteRow, prefix: string, includeSubtree: boolean): boolean {
  if (row.folderPath === prefix) return true
  if (!includeSubtree) return false
  return row.folderPath.startsWith(`${prefix} / `)
}

/** Filters `rows` against `request.filters`, matching the Rust `build_where` AND-combination. */
export function matchesNoteQueryFilters(row: NoteRow, request: NoteQueryRequest): boolean {
  const filters = request.filters
  if (!matchesTagsAny(row, filters.tagsAny)) return false
  if (!matchesTagsAll(row, filters.tagsAll)) return false
  if (filters.status !== null && row.status !== filters.status) return false
  if (filters.noteType !== null && row.noteType !== filters.noteType) return false
  // Rust: `date >= ?` / `date <= ?` against a nullable SQL column — a NULL date
  // never satisfies either comparison, so a missing date excludes the row here too.
  if (filters.dateFrom !== null && (row.date === null || row.date < filters.dateFrom)) return false
  if (filters.dateTo !== null && (row.date === null || row.date > filters.dateTo)) return false
  if (filters.folderId !== null && row.folderId !== filters.folderId) return false
  if (filters.folderPathPrefix !== null && !matchesFolderPathPrefix(row, filters.folderPathPrefix, filters.includeSubtree)) return false
  return true
}

function sortValue(row: NoteRow, field: NoteSortField): string | null {
  switch (field) {
    case 'title': return row.title
    case 'date': return row.date
    case 'updatedAt': return row.updatedAt
    case 'createdAt': return row.createdAt
    default: return null
  }
}

/** Multi-key comparator mirroring SQL `ORDER BY col ASC|DESC NULLS LAST, ...`. */
function compareRows(a: NoteRow, b: NoteRow, request: NoteQueryRequest): number {
  for (const sort of request.sorts) {
    const va = sortValue(a, sort.field)
    const vb = sortValue(b, sort.field)
    if (va === null && vb === null) continue
    if (va === null) return 1
    if (vb === null) return -1
    if (va === vb) continue
    const direction = sort.direction === 'desc' ? -1 : 1
    return va < vb ? -direction : direction
  }
  return 0
}

/** Filters and sorts `rows` per `request`, matching the Rust `query_notes_impl` semantics. */
export function filterAndSortNotes(rows: NoteRow[], request: NoteQueryRequest): NoteRow[] {
  const filtered = rows.filter((row) => matchesNoteQueryFilters(row, request))
  if (request.sorts.length === 0) return filtered
  return filtered.slice().sort((a, b) => compareRows(a, b, request))
}
