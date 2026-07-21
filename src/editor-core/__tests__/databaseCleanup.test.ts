import { describe, expect, it } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { nevoBaseSchema } from '../schema'
import { collectRemovedDatabaseIds, collectDatabaseIds } from '../databaseCleanup'
import { createDefaultDatabaseData } from '../../types/database-block'

describe('collectRemovedDatabaseIds', () => {
  it('returns the removed database even when another database moves into its position', () => {
    const first = createDefaultDatabaseData()
    const second = createDefaultDatabaseData()
    if (first.version !== 2 || second.version !== 2) throw new Error('Expected v2 database data')
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('database_block', { data: first }),
      schema.node('database_block', { data: second }),
    ])
    const state = EditorState.create({ schema, doc })
    const transaction = state.tr.delete(0, doc.child(0).nodeSize)

    expect(collectRemovedDatabaseIds(state.doc, transaction)).toEqual([first.databaseId])
  })

  it('does not remove records when a database node is retained by a transaction', () => {
    const data = createDefaultDatabaseData()
    if (data.version !== 2) throw new Error('Expected v2 database data')
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [schema.node('database_block', { data })])
    const state = EditorState.create({ schema, doc })
    const transaction = state.tr.setNodeMarkup(0, undefined, { data: { ...data, title: 'Renamed' } })

    expect(collectRemovedDatabaseIds(state.doc, transaction)).toEqual([])
  })
})

describe('collectDatabaseIds', () => {
  it('collects every v2 database store id present in the document', () => {
    const first = createDefaultDatabaseData()
    const second = createDefaultDatabaseData()
    if (first.version !== 2 || second.version !== 2) throw new Error('Expected v2 database data')
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('database_block', { data: first }),
      schema.node('paragraph', null, [schema.text('between')]),
      schema.node('database_block', { data: second }),
    ])

    expect(collectDatabaseIds(doc)).toEqual(new Set([first.databaseId, second.databaseId]))
  })

  it('lets a restored database cancel a pending deletion (undo/paste safety)', () => {
    const data = createDefaultDatabaseData()
    if (data.version !== 2) throw new Error('Expected v2 database data')
    const schema = nevoBaseSchema

    // Simulate the reconciliation done in useEditorCore: a delete queues the id,
    // then a later transaction restores the node and must un-queue it.
    const pending = new Set<string>()
    const emptyDoc = schema.node('doc', null, [schema.node('paragraph')])
    const withDatabase = schema.node('doc', null, [schema.node('database_block', { data })])

    collectRemovedDatabaseIds(
      withDatabase,
      EditorState.create({ schema, doc: withDatabase }).tr.delete(0, withDatabase.child(0).nodeSize),
    ).forEach(id => pending.add(id))
    expect(pending.has(data.databaseId)).toBe(true)

    for (const liveId of collectDatabaseIds(withDatabase)) pending.delete(liveId)
    expect(pending.has(data.databaseId)).toBe(false)

    // And with the database genuinely gone, the id stays queued for deletion.
    pending.add(data.databaseId)
    for (const liveId of collectDatabaseIds(emptyDoc)) pending.delete(liveId)
    expect(pending.has(data.databaseId)).toBe(true)
  })
})
