import { describe, expect, it } from 'vitest'
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state'
import type { Command } from 'prosemirror-state'
import { nevoBaseSchema } from '../schema'
import { createCoreCommands } from '../commands'
import { emptyQueryBlockData, normalizeQueryBlockData, type QueryBlockData } from '../../features/query/queryBlockData'

function runCommand(state: EditorState, command: Command): { applied: boolean; state: EditorState } {
  let nextState = state
  const applied = command(state, (transaction) => {
    nextState = state.apply(transaction)
  })
  return { applied, state: nextState }
}

describe('query_block schema node', () => {
  it('registers a query_block node type in the base schema', () => {
    expect(nevoBaseSchema.nodes.query_block).toBeDefined()
  })

  it('round-trips a query_block node through toJSON/fromJSON, preserving data', () => {
    const schema = nevoBaseSchema
    const data: QueryBlockData = {
      filters: {
        tagsAny: ['red'],
        tagsAll: ['urgent'],
        status: 'active',
        noteType: 'task',
        dateFrom: '2024-01-01',
        dateTo: '2024-12-31',
        folderId: null,
        folderPathPrefix: 'Work',
        includeSubtree: true,
      },
      sorts: [{ field: 'title', direction: 'asc' }],
      view: 'table',
    }
    const doc = schema.node('doc', null, [schema.node('query_block', { data })])

    const json = JSON.parse(JSON.stringify(doc.toJSON()))
    const restored = schema.nodeFromJSON(json)

    const restoredBlock = restored.firstChild
    expect(restoredBlock?.type.name).toBe('query_block')
    expect(restoredBlock?.attrs.data).toEqual(data)
  })

  it('round-trips through toDOM/parseDOM, preserving filters/sorts/view', () => {
    const schema = nevoBaseSchema
    const data: QueryBlockData = {
      filters: { ...emptyNoteQueryFiltersFixture(), tagsAny: ['blue'], status: 'done' },
      sorts: [{ field: 'updatedAt', direction: 'desc' }],
      view: 'cards',
    }
    const node = schema.nodes.query_block.create({ data })
    const dom = node.type.spec.toDOM?.(node) as [string, Record<string, string>, string]
    expect(dom[0]).toBe('div')
    expect(dom[1]['data-nevo-query-block']).toBe('true')

    const el = document.createElement('div')
    el.dataset.nevoQueryBlock = 'true'
    el.dataset.query = dom[1]['data-query']
    const parsed = normalizeQueryBlockData(
      (schema.nodes.query_block.spec.parseDOM?.[0].getAttrs as (dom: HTMLElement) => { data: QueryBlockData })(el).data,
    )
    expect(parsed).toEqual(data)
  })
})

function emptyNoteQueryFiltersFixture() {
  return emptyQueryBlockData().filters
}

describe('core.query.insert/update/remove commands', () => {
  it('inserts a query_block node with empty default filters', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)

    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [schema.node('paragraph')]),
    })
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)))

    const insertCommand = core.commands.get('core.query.insert')
    expect(insertCommand).toBeDefined()

    const result = runCommand(state, insertCommand as Command)
    expect(result.applied).toBe(true)

    const queryNode = result.state.doc.firstChild
    expect(queryNode?.type.name).toBe('query_block')
    expect(queryNode?.attrs.data).toEqual(emptyQueryBlockData())
  })

  it('updates the data of the selected query_block node', () => {
    const schema = nevoBaseSchema
    const queryBlock = schema.nodes.query_block
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [queryBlock.create({ data: emptyQueryBlockData() })]),
    })
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 0)))

    const nextData: QueryBlockData = { filters: { ...emptyQueryBlockData().filters, status: 'active' }, sorts: [], view: 'list' }
    const core = createCoreCommands(schema)
    const result = runCommand(state, core.updateQueryAtSelection(nextData))
    expect(result.applied).toBe(true)
    expect(result.state.doc.firstChild?.attrs.data).toEqual(nextData)
  })

  it('removes the selected query_block node', () => {
    const schema = nevoBaseSchema
    const queryBlock = schema.nodes.query_block
    let state = EditorState.create({
      schema,
      doc: schema.node('doc', null, [queryBlock.create({ data: emptyQueryBlockData() }), schema.node('paragraph')]),
    })
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 0)))

    const core = createCoreCommands(schema)
    const result = runCommand(state, core.removeQueryAtSelection)
    expect(result.applied).toBe(true)
    expect(result.state.doc.childCount).toBe(1)
    expect(result.state.doc.firstChild?.type.name).toBe('paragraph')
  })
})
