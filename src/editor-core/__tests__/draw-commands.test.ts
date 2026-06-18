import { describe, expect, it } from 'vitest'
import { EditorState, NodeSelection, type Command } from 'prosemirror-state'
import { nevoBaseSchema } from '../schema'
import { createCoreCommands } from '../commands'
import { createUpdateDrawByIdCommand } from '../commands/draw'

function runCommand(state: EditorState, command: Command): { applied: boolean; state: EditorState } {
  let nextState = state
  const applied = command(state, (tr) => { nextState = state.apply(tr) })
  return { applied, state: nextState }
}

function emptyDocState() {
  const schema = nevoBaseSchema
  return EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.node('paragraph', null, [])]),
  })
}

describe('draw_block commands', () => {
  const core = createCoreCommands(nevoBaseSchema)

  it('inserts a draw_block with a generated drawId', () => {
    const state = emptyDocState()
    const insert = core.commands.get('core.draw.insert') as Command
    const { applied, state: next } = runCommand(state, insert)

    expect(applied).toBe(true)
    const node = next.doc.firstChild
    expect(node?.type.name).toBe('draw_block')
    expect(typeof node?.attrs.drawId).toBe('string')
    expect(node?.attrs.drawId.length).toBeGreaterThan(0)
    expect(node?.attrs.src).toBe('')
    expect(node?.attrs.svgPreview).toBe('')
  })

  it('updateById finds the node by drawId and updates its attrs', () => {
    // Insert first to get a drawId, then update via the registry command.
    const state = emptyDocState()
    const insert = core.commands.get('core.draw.insert') as Command
    const inserted = runCommand(state, insert).state
    const drawId = inserted.doc.firstChild!.attrs.drawId as string

    // The registry stores updateById with fixed (drawId='', attrs={}); we call
    // the underlying factory directly with the real id to verify the lookup.
    const update = createUpdateDrawByIdCommand(nevoBaseSchema.nodes.draw_block, drawId, {
      src: '.nevo/assets/draw.json',
      svgPreview: '<svg/>',
    })
    const { applied, state: updated } = runCommand(inserted, update)

    expect(applied).toBe(true)
    expect(updated.doc.firstChild?.attrs.src).toBe('.nevo/assets/draw.json')
    expect(updated.doc.firstChild?.attrs.svgPreview).toBe('<svg/>')
  })

  it('updateById returns false when the drawId is not present', () => {
    const state = emptyDocState()
    const update = createUpdateDrawByIdCommand(nevoBaseSchema.nodes.draw_block, 'missing-id', { src: 'x' })
    expect(update(state, () => {})).toBe(false)
  })

  it('remove deletes the selected draw_block', () => {
    const state = emptyDocState()
    const insert = core.commands.get('core.draw.insert') as Command
    const inserted = runCommand(state, insert).state

    // The insert command ends with a NodeSelection on the new node.
    expect(inserted.selection instanceof NodeSelection).toBe(true)

    const remove = core.commands.get('core.draw.remove') as Command
    const { applied, state: after } = runCommand(inserted, remove)
    expect(applied).toBe(true)
    expect(after.doc.childCount).toBe(1)
    expect(after.doc.firstChild?.type.name).toBe('paragraph')
  })
})
