import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import type { Command } from 'prosemirror-state'
import { nevoBaseSchema } from '../schema'
import { createCoreCommands } from '../commands'
import { createDefaultDatabaseData, normalizeDatabaseData, type DatabaseBlockData } from '../../types/database-block'

function runCommand(state: EditorState, command: Command): { applied: boolean; state: EditorState } {
  let nextState = state
  const applied = command(state, (transaction) => {
    nextState = state.apply(transaction)
  })
  return { applied, state: nextState }
}

describe('database_block schema node', () => {
  it('registers a database_block node type in the base schema', () => {
    expect(nevoBaseSchema.nodes.database_block).toBeDefined()
  })

  it('round-trips a database_block node through toJSON/fromJSON, preserving data', () => {
    const schema = nevoBaseSchema
    const data = createDefaultDatabaseData()
    const doc = schema.node('doc', null, [schema.node('database_block', { data })])

    const json = JSON.parse(JSON.stringify(doc.toJSON()))
    const restored = schema.nodeFromJSON(json)

    const restoredBlock = restored.firstChild
    expect(restoredBlock?.type.name).toBe('database_block')
    const restoredData = restoredBlock?.attrs.data as DatabaseBlockData
    expect(restoredData.version).toBe(2)
    expect(restoredData.fields).toEqual(data.fields)
    expect(restoredData.views).toEqual(data.views)
    expect(restoredData.activeView).toBe(data.activeView)
  })
})

describe('normalizeDatabaseData', () => {
  it('falls back to defaults for entirely missing input', () => {
    const data = normalizeDatabaseData(null)
    expect(data.fields.length).toBeGreaterThan(0)
    expect(data.views.length).toBeGreaterThan(0)
    expect(data.views.some(v => v.id === data.activeView)).toBe(true)
  })

  it('repairs missing views by generating a default table view', () => {
    const data = normalizeDatabaseData({
      fields: [{ id: 'f1', name: 'Name', type: 'text' }],
      records: [],
      views: [],
    })
    expect(data.views).toHaveLength(1)
    expect(data.views[0].type).toBe('table')
    expect(data.activeView).toBe(data.views[0].id)
  })

  it('drops malformed fields and records while keeping the valid ones', () => {
    const data = normalizeDatabaseData({
      fields: [
        { id: 'f1', name: 'Name', type: 'text' },
        { id: 'bad', name: 'Bad', type: 'not_a_type' },
        { notAField: true },
      ],
      records: [
        { id: 'r1', cells: { f1: 'Alice' } },
        { cells: { f1: 'NoId' } },
        { id: 'r2', cells: { f1: { nested: true } } },
      ],
      views: [{ id: 'v1', name: 'Table', type: 'table', filters: [], sorts: [] }],
      activeView: 'v1',
    })
    expect(data.fields).toEqual([{ id: 'f1', name: 'Name', type: 'text' }])
    expect(data.version).toBe(1)
    if (data.version === 1) {
      expect(data.records.map(r => r.id)).toEqual(['r1', 'r2'])
      expect(data.records[1].cells).toEqual({})
    }
    expect(data.activeView).toBe('v1')
  })

  it('falls back to defaults entirely when no valid fields remain', () => {
    const data = normalizeDatabaseData({ fields: [{ notAField: true }], records: [], views: [] })
    expect(data.fields.length).toBeGreaterThan(0)
    expect(data.fields[0].name).toBe('Name')
  })

  it('normalizes an unsupported table color scheme without discarding the view style', () => {
    const data = normalizeDatabaseData({
      version: 2,
      databaseId: 'database_test',
      rowCount: 0,
      fields: [{ id: 'f1', name: 'Name', type: 'text' }],
      views: [{ id: 'v1', name: 'Table', type: 'table', filters: [], sorts: [], style: { rowColorScheme: 'unsupported', compact: true } }],
      activeView: 'v1',
    })
    expect(data.views[0].style?.rowColorScheme).toBe('neutral')
    expect(data.views[0].style?.compact).toBe(true)
  })

  it('migrates the legacy chart yField into the multi-series chart configuration', () => {
    const data = normalizeDatabaseData({
      version: 2,
      databaseId: 'database_test',
      rowCount: 0,
      fields: [
        { id: 'category', name: 'Category', type: 'text' },
        { id: 'revenue', name: 'Revenue', type: 'number' },
      ],
      views: [{
        id: 'chart',
        name: 'Chart',
        type: 'chart',
        filters: [],
        sorts: [],
        chart: { kind: 'line', xField: 'category', yField: 'revenue', aggregate: 'sum' },
      }],
      activeView: 'chart',
    })

    expect(data.views[0].chart?.yFields).toEqual(['revenue'])
    expect(data.views[0].chart?.yField).toBe('revenue')
    expect(data.views[0].chart?.series?.map(series => series.fieldId)).toEqual(['revenue'])
  })
})

describe('core.database.insert command', () => {
  it('inserts a database_block node with valid DatabaseBlockData', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph')]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))

    const insertCommand = core.commands.get('core.database.insert')
    expect(insertCommand).toBeDefined()

    const result = runCommand(state, insertCommand as Command)
    expect(result.applied).toBe(true)

    const dbNode = result.state.doc.firstChild
    expect(dbNode?.type.name).toBe('database_block')

    const data = dbNode?.attrs.data as DatabaseBlockData
    expect(data.version).toBe(2)
    expect(Array.isArray(data.fields)).toBe(true)
    expect(data.fields.length).toBeGreaterThan(0)
    expect(data.version).toBe(2)
    if (data.version === 2) expect(data.rowCount).toBe(0)
    expect(Array.isArray(data.views)).toBe(true)
    expect(data.views.some(v => v.id === data.activeView)).toBe(true)
  })
})
