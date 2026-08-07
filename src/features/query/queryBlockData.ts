// Data shape stored in the `query_block` node's `data` attr. Kept separate from
// `src/types/note-query.ts` (which mirrors the Rust `query_notes` request/response
// contract exactly) because this also carries the block's own UI state (view type).

import { emptyNoteQueryFilters, type NoteQueryFilters, type NoteSortField, type NoteSortDirection, type NoteSortRule } from '../../types/note-query'

export type QueryBlockView = 'list' | 'table' | 'cards'

export interface QueryBlockData {
  filters: NoteQueryFilters
  sorts: NoteSortRule[]
  view: QueryBlockView
}

export function emptyQueryBlockData(): QueryBlockData {
  return { filters: emptyNoteQueryFilters(), sorts: [], view: 'list' }
}

const SORT_FIELDS: NoteSortField[] = ['title', 'date', 'updatedAt', 'createdAt']
const VIEWS: QueryBlockView[] = ['list', 'table', 'cards']

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function normalizeFilters(value: unknown): NoteQueryFilters {
  const empty = emptyNoteQueryFilters()
  if (!value || typeof value !== 'object') return empty
  const raw = value as Record<string, unknown>
  return {
    tagsAny: asStringArray(raw.tagsAny),
    tagsAll: asStringArray(raw.tagsAll),
    status: asNullableString(raw.status) as NoteQueryFilters['status'],
    noteType: asNullableString(raw.noteType) as NoteQueryFilters['noteType'],
    dateFrom: asNullableString(raw.dateFrom),
    dateTo: asNullableString(raw.dateTo),
    folderId: asNullableString(raw.folderId),
    folderPathPrefix: asNullableString(raw.folderPathPrefix),
    includeSubtree: raw.includeSubtree === true,
  }
}

function normalizeSorts(value: unknown): NoteSortRule[] {
  if (!Array.isArray(value)) return []
  const out: NoteSortRule[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const raw = entry as Record<string, unknown>
    const field = SORT_FIELDS.includes(raw.field as NoteSortField) ? (raw.field as NoteSortField) : null
    if (!field) continue
    const direction: NoteSortDirection = raw.direction === 'desc' ? 'desc' : 'asc'
    out.push({ field, direction })
  }
  return out
}

export function normalizeQueryBlockData(value: unknown): QueryBlockData {
  if (!value || typeof value !== 'object') return emptyQueryBlockData()
  const raw = value as Record<string, unknown>
  const view = VIEWS.includes(raw.view as QueryBlockView) ? (raw.view as QueryBlockView) : 'list'
  return {
    filters: normalizeFilters(raw.filters),
    sorts: normalizeSorts(raw.sorts),
    view,
  }
}

/** Parses the `data-query` DOM attribute (a JSON string) back into `QueryBlockData`. */
export function readQueryBlockDataAttr(value: string | null | undefined): QueryBlockData {
  if (!value) return emptyQueryBlockData()
  try {
    return normalizeQueryBlockData(JSON.parse(value))
  } catch {
    return emptyQueryBlockData()
  }
}

export function serializeQueryBlockData(data: QueryBlockData): string {
  return JSON.stringify(data)
}
