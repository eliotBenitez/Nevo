import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { nevoBaseSchema } from '../schema'
import { createCoreCommands } from '../commands'
import { createCoreSlashItems } from '../state'
import { executeSlashItem } from '../slash'
import type { Command } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

function runCommand(state: EditorState, command: Command): { applied: boolean; state: EditorState } {
  let nextState = state
  const applied = command(state, (transaction) => {
    nextState = state.apply(transaction)
  })

  return { applied, state: nextState }
}

describe('transform error regressions', () => {
  it('does not throw when block commands run inside a callout selection', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)
    const commandIds = [
      'core.paragraph',
      'core.heading.1',
      'core.heading.2',
      'core.heading.3',
      'core.codeBlock',
      'core.checklistItem',
      'core.callout',
    ]

    for (const commandId of commandIds) {
      const command = core.commands.get(commandId)
      expect(command, commandId).toBeTruthy()

      let state = EditorState.create({
        schema,
        doc: schema.node('doc', null, [
          schema.node('callout', { variant: 'info', icon: '💡' }, [
            schema.node('paragraph', null, [schema.text('content')]),
          ]),
        ]),
      })

      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)))
      expect(() => runCommand(state, command as Command), commandId).not.toThrow()
    }
  })

  it('does not throw when slash block commands run after deleting the slash query', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)
    const slashItems = createCoreSlashItems(core.commands)
    const commandIds = ['h1', 'ul', 'ol', 'checklist', 'code', 'quote', 'callout', 'divider']

    for (const slashId of commandIds) {
      const item = slashItems.find((candidate) => candidate.id === slashId)
      expect(item, slashId).toBeTruthy()

      const setupState = EditorState.create({
        schema,
        doc: schema.node('doc', null, [
          schema.node('paragraph', null, [schema.text(`prefix /${slashId}`)]),
        ]),
        plugins: [],
      })
      const mount = document.createElement('div')
      document.body.appendChild(mount)
      const view = new EditorView(mount, {
        state: setupState.apply(setupState.tr.setSelection(TextSelection.create(setupState.doc, `prefix /${slashId}`.length + 1))),
        dispatchTransaction(transaction) {
          view.updateState(view.state.apply(transaction))
        },
      })

      try {
        const range = { from: 8, to: 8 + slashId.length + 1 }
        expect(() => executeSlashItem(view, item as NonNullable<typeof item>, {
          open: true,
          query: slashId,
          range,
          activeIndex: 0,
          itemIds: [slashId],
        }), slashId).not.toThrow()
      } finally {
        view.destroy()
        mount.remove()
      }
    }
  })

  it('keeps block commands non-throwing across valid cursor positions', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)
    const commandIds = [
      'core.paragraph',
      'core.heading.1',
      'core.heading.2',
      'core.heading.3',
      'core.codeBlock',
      'core.blockquote',
      'core.bulletList',
      'core.orderedList',
      'core.checklistItem',
      'core.toggle',
      'core.callout',
      'core.divider',
    ]

    const docs = [
      schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('alpha beta')]),
        schema.node('paragraph', null, [schema.text('gamma')]),
      ]),
      schema.node('doc', null, [
        schema.node('bullet_list', null, [
          schema.node('list_item', null, [
            schema.node('paragraph', null, [schema.text('item one')]),
            schema.node('paragraph', null, [schema.text('item detail')]),
          ]),
          schema.node('list_item', null, [
            schema.node('paragraph', null, [schema.text('item two')]),
          ]),
        ]),
      ]),
      schema.node('doc', null, [
        schema.node('blockquote', null, [
          schema.node('paragraph', null, [schema.text('quoted')]),
        ]),
      ]),
      schema.node('doc', null, [
        schema.node('callout', { variant: 'info', icon: '💡' }, [
          schema.node('paragraph', null, [schema.text('first')]),
          schema.node('paragraph', null, [schema.text('second')]),
        ]),
      ]),
    ]

    const failures: string[] = []

    docs.forEach((doc, docIndex) => {
      for (let pos = 1; pos < doc.content.size; pos += 1) {
        let baseState: EditorState
        try {
          baseState = EditorState.create({ schema, doc }).apply(
            EditorState.create({ schema, doc }).tr.setSelection(TextSelection.create(doc, pos)),
          )
        } catch {
          continue
        }

        for (const commandId of commandIds) {
          const command = core.commands.get(commandId)
          if (!command) continue
          try {
            runCommand(baseState, command)
          } catch (error) {
            failures.push(`${commandId} doc=${docIndex} pos=${pos} error=${error instanceof Error ? error.message : String(error)}`)
          }
        }
      }
    })

    expect(failures).toEqual([])
  })

  it('keeps block commands non-throwing across valid text ranges', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)
    const commandIds = [
      'core.paragraph',
      'core.heading.1',
      'core.heading.2',
      'core.heading.3',
      'core.codeBlock',
      'core.blockquote',
      'core.bulletList',
      'core.orderedList',
      'core.checklistItem',
      'core.toggle',
      'core.callout',
      'core.divider',
    ]

    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('alpha beta')]),
      schema.node('paragraph', null, [schema.text('gamma delta')]),
      schema.node('callout', { variant: 'info', icon: '💡' }, [
        schema.node('paragraph', null, [schema.text('first')]),
        schema.node('paragraph', null, [schema.text('second')]),
      ]),
    ])

    const ranges = [
      [2, 6],
      [2, 14],
      [1, 14],
      [2, doc.content.size - 1],
      [15, doc.content.size - 1],
    ] as const
    const failures: string[] = []

    for (const [from, to] of ranges) {
      let baseState: EditorState
      try {
        const state = EditorState.create({ schema, doc })
        baseState = state.apply(state.tr.setSelection(TextSelection.create(doc, from, to)))
      } catch {
        continue
      }

      for (const commandId of commandIds) {
        const command = core.commands.get(commandId)
        if (!command) continue
        try {
          runCommand(baseState, command)
        } catch (error) {
          failures.push(`${commandId} from=${from} to=${to} error=${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }

    expect(failures).toEqual([])
  })
})
