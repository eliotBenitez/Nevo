import { invoke } from '@tauri-apps/api/core'
import { filterAndSortInWorker } from './databaseWorkerClient'
import { applyOperationsToRecords, buildImportedRecords, cloneRecord, recordsFromSnapshot } from './databaseRecordOps'
import type { DbCellValue, DbField, DbFilterRule, DbRecord, DbSortRule } from '../../types/database-block'

export interface DatabaseQuery {
  offset: number
  limit: number
  fields?: DbField[]
  filters?: DbFilterRule[]
  sorts?: DbSortRule[]
}

export interface DatabaseQueryResult {
  records: DbRecord[]
  total: number
}

export type DatabaseOperation =
  | { type: 'insert'; record: DbRecord; index?: number }
  | { type: 'updateCell'; recordId: string; fieldId: string; value: DbCellValue }
  | { type: 'delete'; recordId: string }
  | { type: 'replace'; records: DbRecord[] }
  | { type: 'deleteField'; fieldId: string }

export interface DatabaseRepository {
  queryRecords(databaseId: string, query: DatabaseQuery): Promise<DatabaseQueryResult>
  applyOperations(databaseId: string, operations: DatabaseOperation[]): Promise<number>
  importRecords(databaseId: string, records: DbRecord[], mode: 'replace' | 'append', onProgress?: (completed: number, total: number) => void): Promise<number>
  readAllRecords(databaseId: string): Promise<DbRecord[]>
  createSnapshot(databaseId: string): Promise<unknown>
  restoreSnapshot(databaseId: string, snapshot: unknown): Promise<number>
  deleteDatabase(databaseId: string): Promise<void>
}

/** Serializes mutations so separate node views cannot race for SQLite's write lock. */
export class DatabaseWriteQueue {
  private tail: Promise<void> = Promise.resolve()

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation)
    this.tail = result.then(() => undefined, () => undefined)
    return result
  }
}

/** A deterministic repository for the web preview and unit tests. */
export class MemoryDatabaseRepository implements DatabaseRepository {
  private readonly databases = new Map<string, DbRecord[]>()

  async queryRecords(databaseId: string, query: DatabaseQuery): Promise<DatabaseQueryResult> {
    let records = this.databases.get(databaseId) ?? []
    if (query.fields) {
      records = await filterAndSortInWorker(records, query.fields, query.filters ?? [], query.sorts ?? [])
    }
    return { records: records.slice(query.offset, query.offset + query.limit).map(cloneRecord), total: records.length }
  }

  async applyOperations(databaseId: string, operations: DatabaseOperation[]): Promise<number> {
    const records = applyOperationsToRecords(this.databases.get(databaseId) ?? [], operations)
    this.databases.set(databaseId, records)
    return records.length
  }

  async importRecords(databaseId: string, records: DbRecord[], mode: 'replace' | 'append', onProgress?: (completed: number, total: number) => void): Promise<number> {
    const next = await buildImportedRecords(this.databases.get(databaseId) ?? [], records, mode, onProgress)
    this.databases.set(databaseId, next)
    return next.length
  }

  async readAllRecords(databaseId: string): Promise<DbRecord[]> {
    return (this.databases.get(databaseId) ?? []).map(cloneRecord)
  }

  async createSnapshot(databaseId: string): Promise<unknown> { return this.readAllRecords(databaseId) }

  async restoreSnapshot(databaseId: string, snapshot: unknown): Promise<number> {
    const records = recordsFromSnapshot(snapshot)
    this.databases.set(databaseId, records)
    return records.length
  }

  async deleteDatabase(databaseId: string): Promise<void> { this.databases.delete(databaseId) }
}

/** Tauri-backed repository. The command contract mirrors DatabaseRepository. */
export class TauriDatabaseRepository implements DatabaseRepository {
  private static readonly writeQueues = new Map<string, DatabaseWriteQueue>()

  constructor(private readonly workspacePath: string) {}

  private queueWrite<T>(operation: () => Promise<T>): Promise<T> {
    let queue = TauriDatabaseRepository.writeQueues.get(this.workspacePath)
    if (!queue) {
      queue = new DatabaseWriteQueue()
      TauriDatabaseRepository.writeQueues.set(this.workspacePath, queue)
    }
    return queue.run(operation)
  }

  async queryRecords(databaseId: string, query: DatabaseQuery) {
    // The native command evaluates all active rules in spawn_blocking and only
    // returns the requested page, so a 40k-row database never crosses IPC.
    return invoke<DatabaseQueryResult>('database_query_records', { workspacePath: this.workspacePath, databaseId, query })
  }
  applyOperations(databaseId: string, operations: DatabaseOperation[]) {
    return this.queueWrite(() => invoke<number>('database_apply_operations', { workspacePath: this.workspacePath, databaseId, operations }))
  }
  importRecords(databaseId: string, records: DbRecord[], mode: 'replace' | 'append', onProgress?: (completed: number, total: number) => void) {
    // Tauri invoke does not stream progress; the caller still receives a final
    // progress event and the memory repository provides granular progress in web.
    return this.queueWrite(() => invoke<number>('database_import_records', { workspacePath: this.workspacePath, databaseId, records, mode })).then(total => {
      onProgress?.(records.length, records.length)
      return total
    })
  }
  readAllRecords(databaseId: string) { return invoke<DbRecord[]>('database_read_all_records', { workspacePath: this.workspacePath, databaseId }) }
  createSnapshot(databaseId: string) { return invoke<unknown>('database_create_snapshot', { workspacePath: this.workspacePath, databaseId }) }
  restoreSnapshot(databaseId: string, snapshot: unknown) { return this.queueWrite(() => invoke<number>('database_restore_snapshot', { workspacePath: this.workspacePath, databaseId, snapshot })) }
  deleteDatabase(databaseId: string) { return this.queueWrite(() => invoke<void>('database_delete', { workspacePath: this.workspacePath, databaseId })) }
}

const webRepository = new MemoryDatabaseRepository()

export function createDatabaseRepository(workspacePath: string | null): DatabaseRepository {
  return workspacePath ? new TauriDatabaseRepository(workspacePath) : webRepository
}
