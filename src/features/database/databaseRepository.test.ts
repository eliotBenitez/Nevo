import { describe, expect, it } from 'vitest'
import { DatabaseWriteQueue, MemoryDatabaseRepository } from './databaseRepository'
import type { DbRecord } from '../../types/database-block'

const record = (id: string, value: number): DbRecord => ({ id, cells: { value } })

describe('MemoryDatabaseRepository', () => {
  it('paginates, updates, imports and restores records without exposing internal references', async () => {
    const repository = new MemoryDatabaseRepository()
    await repository.importRecords('database_test', [record('r1', 1), record('r2', 2), record('r3', 3)], 'replace')
    expect(await repository.queryRecords('database_test', { offset: 1, limit: 1 })).toEqual({ records: [record('r2', 2)], total: 3 })

    await repository.applyOperations('database_test', [{ type: 'updateCell', recordId: 'r2', fieldId: 'value', value: 20 }])
    const snapshot = await repository.createSnapshot('database_test')
    await repository.applyOperations('database_test', [{ type: 'delete', recordId: 'r1' }])
    expect((await repository.readAllRecords('database_test')).map(item => item.id)).toEqual(['r2', 'r3'])

    await repository.restoreSnapshot('database_test', snapshot)
    const restored = await repository.readAllRecords('database_test')
    expect(restored).toEqual([record('r1', 1), record('r2', 20), record('r3', 3)])
    restored[0].cells.value = 99
    expect((await repository.readAllRecords('database_test'))[0].cells.value).toBe(1)
  })

  it('serializes writes and continues after a failed operation', async () => {
    const queue = new DatabaseWriteQueue()
    const order: string[] = []
    let release: () => void = () => {}
    const gate = new Promise<void>(resolve => { release = resolve })

    const first = queue.run(async () => {
      order.push('first:start')
      await gate
      order.push('first:end')
      throw new Error('write failed')
    })
    const second = queue.run(async () => { order.push('second') })

    await Promise.resolve()
    expect(order).toEqual(['first:start'])
    release()
    await expect(first).rejects.toThrow('write failed')
    await second
    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })
})
