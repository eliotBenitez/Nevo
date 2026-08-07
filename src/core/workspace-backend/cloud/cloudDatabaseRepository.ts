// DatabaseRepository backed by the cloud workspace's manifest Y.Doc.
//
// Local workspaces query database blocks through SQLite in Rust; a cloud
// workspace has no such index, so rows ride along in the E2E-encrypted manifest
// document and all filtering/sorting/paging happens client-side with the same
// semantics (see databaseRecordOps). Without this the editor fell back to a
// process-wide in-memory repository and every row was lost on reload.
//
// v1 limits: a write replaces the whole row list for that database (fine for
// the thousands-of-rows range these blocks hold in practice, unlike the
// 40k-row case SQLite paging was built for), and concurrent edits to the same
// database resolve last-writer-wins rather than merging.

import type * as Y from 'yjs'
import type { DbRecord } from '../../../types/database-block'
import type {
  DatabaseOperation,
  DatabaseQuery,
  DatabaseQueryResult,
  DatabaseRepository,
} from '../../../features/database/databaseRepository'
import {
  applyOperationsToRecords,
  buildImportedRecords,
  cloneRecord,
  recordsFromSnapshot,
} from '../../../features/database/databaseRecordOps'
import { filterAndSortInWorker } from '../../../features/database/databaseWorkerClient'
import { readDatabaseRecords, writeDatabaseRecords, deleteDatabaseRecords } from './databaseOps'

export class CloudDatabaseRepository implements DatabaseRepository {
  /** `getYDoc` is lazy because the manifest session is created in open(). */
  constructor(private readonly getYDoc: () => Y.Doc | null) {}

  private read(databaseId: string): DbRecord[] {
    const ydoc = this.getYDoc()
    return ydoc ? readDatabaseRecords(ydoc, databaseId) : []
  }

  private write(databaseId: string, records: DbRecord[]): void {
    const ydoc = this.getYDoc()
    if (!ydoc) throw new Error('Cloud workspace is not open')
    writeDatabaseRecords(ydoc, databaseId, records)
  }

  async queryRecords(databaseId: string, query: DatabaseQuery): Promise<DatabaseQueryResult> {
    let records = this.read(databaseId)
    if (query.fields) {
      records = await filterAndSortInWorker(records, query.fields, query.filters ?? [], query.sorts ?? [])
    }
    return {
      records: records.slice(query.offset, query.offset + query.limit).map(cloneRecord),
      total: records.length,
    }
  }

  async applyOperations(databaseId: string, operations: DatabaseOperation[]): Promise<number> {
    const records = applyOperationsToRecords(this.read(databaseId), operations)
    this.write(databaseId, records)
    return records.length
  }

  async importRecords(
    databaseId: string,
    records: DbRecord[],
    mode: 'replace' | 'append',
    onProgress?: (completed: number, total: number) => void,
  ): Promise<number> {
    const next = await buildImportedRecords(this.read(databaseId), records, mode, onProgress)
    this.write(databaseId, next)
    return next.length
  }

  async readAllRecords(databaseId: string): Promise<DbRecord[]> {
    return this.read(databaseId)
  }

  async createSnapshot(databaseId: string): Promise<unknown> {
    return this.read(databaseId)
  }

  async restoreSnapshot(databaseId: string, snapshot: unknown): Promise<number> {
    const records = recordsFromSnapshot(snapshot)
    this.write(databaseId, records)
    return records.length
  }

  async deleteDatabase(databaseId: string): Promise<void> {
    const ydoc = this.getYDoc()
    if (ydoc) deleteDatabaseRecords(ydoc, databaseId)
  }
}
