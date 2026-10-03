import { describe, expect, it, vi } from 'vitest'
import { EditorState, TextSelection, type Command } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../schema'
import {
  createFocusFirstBlockOrCreateEmptyCommand,
  focusEditorFirstBlock,
  isFirstBlockEmpty,
} from '../commands/titleNavigation'

function runCommand(
  state: EditorState,
  command: Command,
  view?: EditorView,
): { applied: boolean; state: EditorState } {
  let nextState = state
  const applied = command(
    state,
    (transaction) => {
      nextState = state.apply(transaction)
    },
    view,
  )

  return { applied, state: nextState }
}

describe('titleNavigation', () => {
  const schema = nevoBaseSchema

  describe('isFirstBlockEmpty', () => {
    it('returns false for empty document without children', () => {
      const doc = schema.nodes.doc.create(null, [])
      expect(isFirstBlockEmpty(doc)).toBe(false)
    })

    it('returns true for an empty paragraph', () => {
      const doc = schema.node('doc', null, [schema.node('paragraph')])
      expect(isFirstBlockEmpty(doc)).toBe(true)
    })

    it('returns true for a paragraph containing only whitespace', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('   ')]),
      ])
      expect(isFirstBlockEmpty(doc)).toBe(true)
    })

    it('returns false for a paragraph with text', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('Hello')]),
      ])
      expect(isFirstBlockEmpty(doc)).toBe(false)
    })

    it('returns true for an empty heading', () => {
      const doc = schema.node('doc', null, [
        schema.node('heading', { level: 1 }),
      ])
      expect(isFirstBlockEmpty(doc)).toBe(true)
    })

    it('returns false for a heading with text', () => {
      const doc = schema.node('doc', null, [
        schema.node('heading', { level: 1 }, [schema.text('Title')]),
      ])
      expect(isFirstBlockEmpty(doc)).toBe(false)
    })

    it('returns true for an empty checklist item', () => {
      const doc = schema.node('doc', null, [
        schema.node('checklist_item'),
      ])
      expect(isFirstBlockEmpty(doc)).toBe(true)
    })

    it('returns false for a checklist item with text', () => {
      const doc = schema.node('doc', null, [
        schema.node('checklist_item', null, [schema.text('Task')]),
      ])
      expect(isFirstBlockEmpty(doc)).toBe(false)
    })

    it('returns false for code block even if empty', () => {
      const doc = schema.node('doc', null, [
        schema.node('code_block'),
      ])
      expect(isFirstBlockEmpty(doc)).toBe(false)
    })

    it('returns false for divider', () => {
      const doc = schema.node('doc', null, [
        schema.node('divider'),
      ])
      expect(isFirstBlockEmpty(doc)).toBe(false)
    })
  })

  describe('createFocusFirstBlockOrCreateEmptyCommand', () => {
    it('focuses existing empty paragraph without inserting another block', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph'),
        schema.node('paragraph', null, [schema.text('Second line')]),
      ])
      const state = EditorState.create({ schema, doc })
      const mockView = { focus: vi.fn() } as unknown as EditorView

      const result = runCommand(state, createFocusFirstBlockOrCreateEmptyCommand(), mockView)

      expect(result.applied).toBe(true)
      expect(result.state.doc.childCount).toBe(2)
      expect(result.state.doc.child(0).type.name).toBe('paragraph')
      expect(result.state.doc.child(0).content.size).toBe(0)
      expect(result.state.selection.from).toBe(1)
      expect(result.state.selection.to).toBe(1)
      expect(mockView.focus).toHaveBeenCalledTimes(1)
    })

    it('moves cursor from another position back to the empty first block', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph'),
        schema.node('paragraph', null, [schema.text('Second line')]),
      ])
      let state = EditorState.create({ schema, doc })
      // Put selection in the second paragraph
      state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)))
      expect(state.selection.from).toBe(5)

      const mockView = { focus: vi.fn() } as unknown as EditorView
      const result = runCommand(state, createFocusFirstBlockOrCreateEmptyCommand(), mockView)

      expect(result.applied).toBe(true)
      expect(result.state.doc.childCount).toBe(2)
      expect(result.state.selection.from).toBe(1)
      expect(mockView.focus).toHaveBeenCalledTimes(1)
    })

    it('creates an empty paragraph when the first block is not empty', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('First line text')]),
      ])
      const state = EditorState.create({ schema, doc })
      const mockView = { focus: vi.fn() } as unknown as EditorView

      const result = runCommand(state, createFocusFirstBlockOrCreateEmptyCommand(), mockView)

      expect(result.applied).toBe(true)
      expect(result.state.doc.childCount).toBe(2)
      expect(result.state.doc.child(0).type.name).toBe('paragraph')
      expect(result.state.doc.child(0).content.size).toBe(0)
      expect(result.state.doc.child(1).textContent).toBe('First line text')
      expect(result.state.selection.from).toBe(1)
      expect(mockView.focus).toHaveBeenCalledTimes(1)
    })

    it('creates an empty paragraph when the first block is a non-empty heading', () => {
      const doc = schema.node('doc', null, [
        schema.node('heading', { level: 1 }, [schema.text('Heading 1')]),
      ])
      const state = EditorState.create({ schema, doc })
      const mockView = { focus: vi.fn() } as unknown as EditorView

      const result = runCommand(state, createFocusFirstBlockOrCreateEmptyCommand(), mockView)

      expect(result.applied).toBe(true)
      expect(result.state.doc.childCount).toBe(2)
      expect(result.state.doc.child(0).type.name).toBe('paragraph')
      expect(result.state.doc.child(0).content.size).toBe(0)
      expect(result.state.doc.child(1).type.name).toBe('heading')
      expect(result.state.doc.child(1).textContent).toBe('Heading 1')
      expect(result.state.selection.from).toBe(1)
      expect(mockView.focus).toHaveBeenCalledTimes(1)
    })

    it('focuses existing empty heading without inserting another block', () => {
      const doc = schema.node('doc', null, [
        schema.node('heading', { level: 2 }),
      ])
      const state = EditorState.create({ schema, doc })
      const mockView = { focus: vi.fn() } as unknown as EditorView

      const result = runCommand(state, createFocusFirstBlockOrCreateEmptyCommand(), mockView)

      expect(result.applied).toBe(true)
      expect(result.state.doc.childCount).toBe(1)
      expect(result.state.doc.child(0).type.name).toBe('heading')
      expect(result.state.selection.from).toBe(1)
      expect(mockView.focus).toHaveBeenCalledTimes(1)
    })

    it('creates an empty paragraph when the first block is a divider', () => {
      const doc = schema.node('doc', null, [
        schema.node('divider'),
      ])
      const state = EditorState.create({ schema, doc })
      const mockView = { focus: vi.fn() } as unknown as EditorView

      const result = runCommand(state, createFocusFirstBlockOrCreateEmptyCommand(), mockView)

      expect(result.applied).toBe(true)
      expect(result.state.doc.childCount).toBe(2)
      expect(result.state.doc.child(0).type.name).toBe('paragraph')
      expect(result.state.doc.child(1).type.name).toBe('divider')
      expect(result.state.selection.from).toBe(1)
      expect(mockView.focus).toHaveBeenCalledTimes(1)
    })

    it('returns true on dry-run without mutating state', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('Existing')]),
      ])
      const state = EditorState.create({ schema, doc })
      const cmd = createFocusFirstBlockOrCreateEmptyCommand()

      const applied = cmd(state, undefined)

      expect(applied).toBe(true)
      expect(state.doc.childCount).toBe(1)
    })

    it('focusEditorFirstBlock helper invokes command on view', () => {
      const doc = schema.node('doc', null, [
        schema.node('paragraph', null, [schema.text('Hello')]),
      ])
      let state = EditorState.create({ schema, doc })
      const mockView = {
        get state() {
          return state
        },
        dispatch: vi.fn((tr) => {
          state = state.apply(tr)
        }),
        focus: vi.fn(),
      } as unknown as EditorView

      const success = focusEditorFirstBlock(mockView)

      expect(success).toBe(true)
      expect(mockView.dispatch).toHaveBeenCalledTimes(1)
      expect(mockView.focus).toHaveBeenCalledTimes(1)
      expect(state.doc.childCount).toBe(2)
      expect(state.doc.child(0).content.size).toBe(0)
    })
  })
})
