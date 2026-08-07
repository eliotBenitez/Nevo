import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { CloudDatabaseRepository } from './cloudDatabaseRepository'
import { CLOUD_LOCAL_ORIGIN } from './session'
import type { DbRecord } from '../../../types/database-block'

const record = (id: string, value: number): DbRecord => ({ id, cells: { value } })

describe('CloudDatabaseRepository', () => {
  it('persists rows into the Y.Doc so they survive a reload of the workspace', async () => {
    const ydoc = new Y.Doc()
    const repository = new CloudDatabaseRepository(() => ydoc)

    await repository.importRecords('database_a', [record('r1', 1), record('r2', 2)], 'replace')
    await repository.applyOperations('database_a', [
      { type: 'updateCell', recordId: 'r2', fieldId: 'value', value: 20 },
    ])

    // Reopening the workspace means a fresh Y.Doc synced from the relay: model
    // that as a second doc built from the encoded state, plus a new repository.
    const reopened = new Y.Doc()
    Y.applyUpdate(reopened, Y.encodeStateAsUpdate(ydoc))
    const afterReload = new CloudDatabaseRepository(() => reopened)

    expect(await afterReload.readAllRecords('database_a')).toEqual([record('r1', 1), record('r2', 20)])

    ydoc.destroy()
    reopened.destroy()
  })

  it('keeps databases in separate keys so one write does not clobber another', async () => {
    const ydoc = new Y.Doc()
    const repository = new CloudDatabaseRepository(() => ydoc)

    await repository.importRecords('database_a', [record('a1', 1)], 'replace')
    await repository.importRecords('database_b', [record('b1', 2)], 'replace')
    await repository.applyOperations('database_a', [{ type: 'insert', record: record('a2', 3) }])

    expect((await repository.readAllRecords('database_a')).map(r => r.id)).toEqual(['a1', 'a2'])
    expect(await repository.readAllRecords('database_b')).toEqual([record('b1', 2)])
    ydoc.destroy()
  })

  it('paginates, snapshots, restores and deletes like the local repository', async () => {
    const ydoc = new Y.Doc()
    const repository = new CloudDatabaseRepository(() => ydoc)

    await repository.importRecords('db', [record('r1', 1), record('r2', 2), record('r3', 3)], 'replace')
    expect(await repository.queryRecords('db', { offset: 1, limit: 1 }))
      .toEqual({ records: [record('r2', 2)], total: 3 })

    const snapshot = await repository.createSnapshot('db')
    await repository.applyOperations('db', [{ type: 'delete', recordId: 'r1' }])
    expect((await repository.readAllRecords('db')).map(r => r.id)).toEqual(['r2', 'r3'])

    expect(await repository.restoreSnapshot('db', snapshot)).toBe(3)
    expect((await repository.readAllRecords('db')).map(r => r.id)).toEqual(['r1', 'r2', 'r3'])

    await repository.importRecords('db', [record('r4', 4)], 'append')
    expect((await repository.readAllRecords('db')).map(r => r.id)).toEqual(['r1', 'r2', 'r3', 'r4'])

    await repository.deleteDatabase('db')
    expect(await repository.readAllRecords('db')).toEqual([])
    ydoc.destroy()
  })

  it('never hands out references into the stored state', async () => {
    const ydoc = new Y.Doc()
    const repository = new CloudDatabaseRepository(() => ydoc)
    await repository.importRecords('db', [record('r1', 1)], 'replace')

    const rows = await repository.readAllRecords('db')
    rows[0].cells.value = 99

    expect((await repository.readAllRecords('db'))[0].cells.value).toBe(1)
    ydoc.destroy()
  })

  it('writes under the local origin so the manifest observer ignores its own edits', async () => {
    const ydoc = new Y.Doc()
    const repository = new CloudDatabaseRepository(() => ydoc)
    const origins: unknown[] = []
    ydoc.on('afterTransaction', (transaction: Y.Transaction) => { origins.push(transaction.origin) })

    await repository.applyOperations('db', [{ type: 'insert', record: record('r1', 1) }])

    expect(origins).toContain(CLOUD_LOCAL_ORIGIN)
    ydoc.destroy()
  })

  it('reads empty and refuses to write before the workspace is open', async () => {
    const repository = new CloudDatabaseRepository(() => null)

    expect(await repository.readAllRecords('db')).toEqual([])
    expect(await repository.queryRecords('db', { offset: 0, limit: 10 })).toEqual({ records: [], total: 0 })
    await expect(repository.applyOperations('db', [{ type: 'insert', record: record('r1', 1) }]))
      .rejects.toThrow('Cloud workspace is not open')
    // Deleting a database that was never opened is a no-op, not a failure.
    await expect(repository.deleteDatabase('db')).resolves.toBeUndefined()
  })
})
