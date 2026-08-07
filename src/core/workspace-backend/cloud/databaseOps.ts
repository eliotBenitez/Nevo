// Persistence edge for cloud database blocks: each database's rows live under
// its own key in the manifest Y.Doc's `databases` map, so edits to different
// databases never clobber one another (a single shared value, as kanban uses,
// would make every cell edit a whole-workspace rewrite).
//
// Within one database the value is replaced atomically (LWW per write), the
// same trade-off the manifest and kanban make: no JSON-level merge, so two
// people editing the *same* database concurrently resolve last-writer-wins.

import * as Y from 'yjs'
import type { DbRecord } from '../../../types/database-block'
import { plainClone } from './manifest'
import { CLOUD_LOCAL_ORIGIN } from './session'

const DATABASES_MAP = 'databases'

function databasesMap(ydoc: Y.Doc): Y.Map<DbRecord[]> {
  return ydoc.getMap<DbRecord[]>(DATABASES_MAP)
}

/** All rows of one database, as a plain (non-reactive, non-Yjs) array. */
export function readDatabaseRecords(ydoc: Y.Doc, databaseId: string): DbRecord[] {
  const stored = databasesMap(ydoc).get(databaseId)
  return stored ? plainClone(stored) : []
}

/** Replace one database's rows under a local-origin transaction. */
export function writeDatabaseRecords(ydoc: Y.Doc, databaseId: string, records: DbRecord[]): void {
  ydoc.transact(() => {
    databasesMap(ydoc).set(databaseId, plainClone(records))
  }, CLOUD_LOCAL_ORIGIN)
}

/** Drop a database entirely (its block was deleted from a note). */
export function deleteDatabaseRecords(ydoc: Y.Doc, databaseId: string): void {
  ydoc.transact(() => {
    databasesMap(ydoc).delete(databaseId)
  }, CLOUD_LOCAL_ORIGIN)
}
