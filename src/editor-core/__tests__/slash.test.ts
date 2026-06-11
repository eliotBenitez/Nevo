import { describe, expect, it } from 'vitest'
import { EditorState, Selection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../schema'
import { createCoreCommands } from '../commands'
import { createCoreSlashItems } from '../state'
import { createSlashCommandPlugin, executeSlashItem, getSlashMenuState, nevoSlashPluginKey } from '../slash'

function createSlashState(text: string): EditorState {
  const schema = nevoBaseSchema
  const coreCommands = createCoreCommands(schema)
  const slashItems = createCoreSlashItems(coreCommands.commands)

  let state = EditorState.create({
    schema,
    doc: schema.node('doc', null, [schema.node('paragraph', null, text ? [schema.text(text)] : [])]),
    plugins: [createSlashCommandPlugin(() => slashItems)],
  })

  const cursorPos = text.length > 0 ? 2 + text.length - 1 : 2
  state = state.apply(state.tr.setSelection(Selection.near(state.doc.resolve(cursorPos))))

  return state
}

describe('slash plugin state', () => {
  it('opens menu and matches items by query', () => {
    const state = createSlashState('/h')

    const slashState = getSlashMenuState(state)
    expect(slashState.open).toBe(true)
    expect(slashState.query).toBe('h')
    expect(slashState.itemIds).toContain('h1')
    expect(slashState.itemIds).toContain('h2')
    expect(slashState.itemIds).toContain('h3')
    expect(slashState.itemIds).toContain('h4')
    expect(slashState.itemIds).toContain('h5')
    expect(slashState.itemIds).toContain('h6')
  })

  it('executes heading 4 through 6 slash items', () => {
    const schema = nevoBaseSchema
    const coreCommands = createCoreCommands(schema)
    const slashItems = createCoreSlashItems(coreCommands.commands)
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    try {
      for (const level of [4, 5, 6]) {
        let state = EditorState.create({
          schema,
          doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text(`/h${level}`)])]),
          plugins: [createSlashCommandPlugin(() => slashItems)],
        })
        state = state.apply(state.tr.setSelection(Selection.near(state.doc.resolve(4))))

        const view = new EditorView(mount, {
          state,
          dispatchTransaction(transaction) {
            view.updateState(view.state.apply(transaction))
          },
        })

        const item = slashItems.find((candidate) => candidate.id === `h${level}`)
        expect(item).toBeTruthy()
        expect(() => executeSlashItem(view, item as NonNullable<typeof item>, {
          open: true,
          query: `h${level}`,
          range: { from: 1, to: 4 },
          activeIndex: 0,
          itemIds: [`h${level}`],
        })).not.toThrow()
        expect(view.state.doc.firstChild?.type.name).toBe('heading')
        expect(view.state.doc.firstChild?.attrs.level).toBe(level)
        view.destroy()
      }
    } finally {
      mount.remove()
    }
  })

  it('matches newly added math/table/image slash items', () => {
    const state = createSlashState('/ma')
    const slashState = getSlashMenuState(state)

    expect(slashState.open).toBe(true)
    expect(slashState.itemIds).toContain('math')
    expect(slashState.itemIds).toContain('math-inline')
  })

  it('matches divider slash item', () => {
    const state = createSlashState('/div')
    const slashState = getSlashMenuState(state)

    expect(slashState.open).toBe(true)
    expect(slashState.itemIds).toContain('divider')
  })

  it('matches emoji slash item', () => {
    const state = createSlashState('/emoji')
    const slashState = getSlashMenuState(state)

    expect(slashState.open).toBe(true)
    expect(slashState.itemIds).toContain('emoji')
  })

  it('keeps emoji last inside the text slash category', () => {
    const state = createSlashState('/')
    const slashState = getSlashMenuState(state)
    const textIds = slashState.itemIds.filter((id) => ['paragraph', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'emoji'].includes(id))

    expect(textIds[textIds.length - 1]).toBe('emoji')
  })

  it('moves active index and supports dismiss/reopen on query change', () => {
    const initial = createSlashState('/h')

    const moved = initial.apply(initial.tr.setMeta(nevoSlashPluginKey, { type: 'move', delta: 1 }))
    expect(getSlashMenuState(moved).activeIndex).toBe(1)

    const dismissed = moved.apply(moved.tr.setMeta(nevoSlashPluginKey, { type: 'dismiss' }))
    expect(getSlashMenuState(dismissed).open).toBe(false)

    const reopened = dismissed.apply(dismissed.tr.insertText('1'))
    const reopenedState = getSlashMenuState(reopened)
    expect(reopenedState.open).toBe(true)
    expect(reopenedState.query).toBe('h1')
    expect(reopenedState.itemIds[0]).toBe('h1')
  })

  it('groups items by categories in the correct order', () => {
    const state = createSlashState('/')
    const slashState = getSlashMenuState(state)
    const items = slashState.itemIds

    const indexH1 = items.indexOf('h1')
    const indexUl = items.indexOf('ul')
    const indexCode = items.indexOf('code')

    if (indexH1 !== -1 && indexUl !== -1) {
      expect(indexH1).toBeLessThan(indexUl)
    }
    if (indexUl !== -1 && indexCode !== -1) {
      expect(indexUl).toBeLessThan(indexCode)
    }
  })
})
