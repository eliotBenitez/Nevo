// Framework-agnostic record semantics for database blocks, shared by every
// non-SQLite repository (the in-memory one used by tests/web preview and the
// Yjs-backed cloud one). Keeping these here means a cloud database behaves
// exactly like a local one; only the persistence edge differs.

import type { DbRecord } from '../../types/database-block'
import type { DatabaseOperation } from './databaseRepository'

export function cloneRecord(record: DbRecord): DbRecord {
  return { id: record.id, cells: { ...record.cells } }
}

export function isDbRecord(value: unknown): value is DbRecord {
  return !!value && typeof value === 'object'
    && typeof (value as DbRecord).id === 'string'
    && !!(value as DbRecord).cells
}

/** Applies operations in order to a copy of `records` and returns the result. */
export function applyOperationsToRecords(records: readonly DbRecord[], operations: DatabaseOperation[]): DbRecord[] {
  let next = [...records]
  for (const operation of operations) {
    if (operation.type === 'insert') {
      const index = operation.index == null ? next.length : Math.max(0, Math.min(operation.index, next.length))
      next.splice(index, 0, cloneRecord(operation.record))
    } else if (operation.type === 'updateCell') {
      const index = next.findIndex(record => record.id === operation.recordId)
      if (index >= 0) next[index] = { ...next[index], cells: { ...next[index].cells, [operation.fieldId]: operation.value } }
    } else if (operation.type === 'delete') {
      next = next.filter(record => record.id !== operation.recordId)
    } else if (operation.type === 'replace') {
      next = operation.records.map(cloneRecord)
    } else {
      next = next.map((record) => {
        if (!(operation.fieldId in record.cells)) return record
        const cells = { ...record.cells }
        delete cells[operation.fieldId]
        return { ...record, cells }
      })
    }
  }
  return next
}

/** Coerces an untrusted snapshot value back into a record list. */
export function recordsFromSnapshot(snapshot: unknown): DbRecord[] {
  return Array.isArray(snapshot) ? snapshot.filter(isDbRecord).map(cloneRecord) : []
}

const IMPORT_BATCH_SIZE = 500

/**
 * Builds the post-import record list, yielding between batches so the caller's
 * progress callback can paint. Purely computational — persistence is the
 * repository's job.
 */
export async function buildImportedRecords(
  existing: readonly DbRecord[],
  records: DbRecord[],
  mode: 'replace' | 'append',
  onProgress?: (completed: number, total: number) => void,
): Promise<DbRecord[]> {
  const total = records.length
  const next = mode === 'append' ? [...existing] : []
  for (let index = 0; index < records.length; index += IMPORT_BATCH_SIZE) {
    next.push(...records.slice(index, index + IMPORT_BATCH_SIZE).map(cloneRecord))
    onProgress?.(Math.min(index + IMPORT_BATCH_SIZE, total), total)
    // Lets the UI paint progress without changing persistence semantics.
    await Promise.resolve()
  }
  return next
}
