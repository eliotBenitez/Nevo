// Human-readable one-line summary of a query_block's filters/sorts. Used by the
// static export placeholder (markdown/html/typst/docx never run a live query)
// and by the node view's header while results are loading.

import type { QueryBlockData } from './queryBlockData'

export function summarizeQueryBlockFilters(data: QueryBlockData): string {
  const { filters } = data
  const parts: string[] = []

  if (filters.tagsAny.length > 0) parts.push(`tags: ${filters.tagsAny.join(', ')}`)
  if (filters.tagsAll.length > 0) parts.push(`all tags: ${filters.tagsAll.join(', ')}`)
  if (filters.status) parts.push(`status: ${filters.status}`)
  if (filters.noteType) parts.push(`type: ${filters.noteType}`)
  if (filters.dateFrom || filters.dateTo) {
    parts.push(`date: ${filters.dateFrom ?? '…'} – ${filters.dateTo ?? '…'}`)
  }
  if (filters.folderPathPrefix) {
    parts.push(`folder: ${filters.folderPathPrefix}${filters.includeSubtree ? ' (+subfolders)' : ''}`)
  }

  return parts.length > 0 ? parts.join(', ') : 'all notes'
}
