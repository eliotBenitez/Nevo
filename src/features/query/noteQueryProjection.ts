// Projects `NoteRow[]` (from `query_notes`) onto the generic `DbField`/`DbRecord`
// shapes so the Query block can reuse the database_block table/list/cards views
// instead of duplicating their rendering logic.

import type { DbField, DbFieldOption, DbRecord } from '../../types/database-block'
import type { NoteRow } from '../../types/note-query'
import type { QueryBlockView } from './queryBlockData'

export const QUERY_FIELD_TITLE = 'title'
export const QUERY_FIELD_TAGS = 'tags'
export const QUERY_FIELD_STATUS = 'status'
export const QUERY_FIELD_TYPE = 'noteType'
export const QUERY_FIELD_DATE = 'date'
export const QUERY_FIELD_FOLDER = 'folderPath'

const STATUS_VALUES = ['none', 'draft', 'active', 'waiting', 'done']
const TYPE_VALUES = ['note', 'task', 'idea', 'meeting', 'project', 'research']

function collectTagOptions(rows: NoteRow[]): DbFieldOption[] {
  const tags = new Set<string>()
  for (const row of rows) {
    for (const tag of row.tags) tags.add(tag)
  }
  return Array.from(tags).sort((a, b) => a.localeCompare(b)).map((tag) => ({ id: tag, name: tag }))
}

/**
 * Builds the field definitions for projecting `NoteRow[]` into the reused
 * database views. Tag options are derived from the rows actually present (tags
 * are free-form); status/type options reuse the fixed note property enums and
 * the same i18n labels as the note properties panel.
 */
export function noteQueryFields(rows: NoteRow[], t: (key: string) => string): DbField[] {
  const statusOptions: DbFieldOption[] = STATUS_VALUES.map((value) => ({
    id: value,
    name: t(`workspace.rightPanel.properties.statuses.${value}`),
  }))
  const typeOptions: DbFieldOption[] = TYPE_VALUES.map((value) => ({
    id: value,
    name: t(`workspace.rightPanel.properties.types.${value}`),
  }))

  return [
    { id: QUERY_FIELD_TITLE, name: t('editor.queryBlock.fields.title'), type: 'text', width: 260 },
    { id: QUERY_FIELD_TAGS, name: t('editor.queryBlock.fields.tags'), type: 'multi_select', options: collectTagOptions(rows) },
    { id: QUERY_FIELD_STATUS, name: t('editor.queryBlock.fields.status'), type: 'select', options: statusOptions },
    { id: QUERY_FIELD_TYPE, name: t('editor.queryBlock.fields.type'), type: 'select', options: typeOptions },
    { id: QUERY_FIELD_DATE, name: t('editor.queryBlock.fields.date'), type: 'date' },
    { id: QUERY_FIELD_FOLDER, name: t('editor.queryBlock.fields.folder'), type: 'text', width: 200 },
  ]
}

/**
 * The list view is intentionally title-only. Generic database lists render
 * every field after the first one as a metadata line, which makes note
 * properties look like query conditions below each result.
 */
export function noteQueryFieldsForView(
  rows: NoteRow[],
  t: (key: string) => string,
  view: QueryBlockView,
): DbField[] {
  const fields = noteQueryFields(rows, t)
  return view === 'list' ? fields.slice(0, 1) : fields
}

/** Projects note rows into `DbRecord`s keyed by the field ids from `noteQueryFields`. */
export function noteRowsToDbRecords(rows: NoteRow[]): DbRecord[] {
  return rows.map((row) => ({
    id: row.noteId,
    cells: {
      [QUERY_FIELD_TITLE]: row.icon ? `${row.icon} ${row.title}` : row.title,
      [QUERY_FIELD_TAGS]: row.tags,
      [QUERY_FIELD_STATUS]: row.status,
      [QUERY_FIELD_TYPE]: row.noteType,
      [QUERY_FIELD_DATE]: row.date,
      [QUERY_FIELD_FOLDER]: row.folderPath,
    },
  }))
}
