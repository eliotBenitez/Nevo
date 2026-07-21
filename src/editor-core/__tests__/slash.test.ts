import { describe, expect, it, vi } from 'vitest'
import { EditorState, Selection, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import type { Node as PMNode } from 'prosemirror-model'
import { nevoBaseSchema } from '../schema'
import { createCoreCommands } from '../commands'
import { createCoreSlashItems } from '../state'
import { createSlashCommandPlugin, executeSlashItem, getSlashMenuState, nevoSlashPluginKey } from '../slash'
import type { NevoSlashItem } from '../../types/editor-plugin'

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

function findParagraphByText(doc: PMNode, text: string): number {
  let result = -1
  doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph' && node.textContent === text) {
      result = pos
      return false
    }
    return result === -1
  })
  if (result === -1) throw new Error(`Paragraph not found: ${text}`)
  return result
}

function createListSlashView(slash: string, nested = false): { view: EditorView; slashItems: NevoSlashItem[]; mount: HTMLDivElement } {
  const schema = nevoBaseSchema
  const core = createCoreCommands(schema)
  const slashItems = createCoreSlashItems(core.commands)
  const targetItem = schema.node('list_item', null, [schema.node('paragraph', null, [schema.text(slash)])])
  const content = nested
    ? [
        schema.node('bullet_list', null, [
          schema.node('list_item', null, [
            schema.node('paragraph', null, [schema.text('parent')]),
            schema.node('bullet_list', null, [targetItem]),
          ]),
        ]),
      ]
    : [schema.node('bullet_list', null, [targetItem])]
  const doc = schema.node('doc', null, content)
  const paragraphPos = findParagraphByText(doc, slash)
  let state = EditorState.create({
    schema,
    doc,
    plugins: [createSlashCommandPlugin(() => slashItems)],
  })
  state = state.apply(state.tr.setSelection(TextSelection.create(doc, paragraphPos + 1 + slash.length)))

  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const view = new EditorView(mount, {
    state,
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction))
    },
  })

  return { view, slashItems, mount }
}

function executeListSlash(view: EditorView, item: NevoSlashItem): void {
  const slashState = getSlashMenuState(view.state)
  const range = slashState.range ?? {
    from: view.state.selection.$from.start(),
    to: view.state.selection.from,
  }
  expect(executeSlashItem(view, item, { ...slashState, range })).toBe(true)
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

  it.each([
    ['h1', 'heading'],
    ['code', 'code_block'],
    ['math', 'math_block'],
    ['table', 'table'],
    ['image', 'image_block'],
    ['file', 'file_block'],
    ['mermaid', 'mermaid_block'],
    ['draw', 'draw_block'],
    ['markmap', 'markmap_block'],
    ['chart', 'vega_block'],
    ['note-embed', 'note_embed'],
    ['embed', 'embed_block'],
    ['audio', 'media_block'],
    ['video', 'media_block'],
    ['quote', 'blockquote'],
    ['callout', 'callout'],
    ['toggle', 'toggle'],
    ['divider', 'divider'],
    ['checklist', 'checklist_item'],
  ])('keeps the required paragraph and inserts /%s inside the current list item', (id, blockType) => {
    const { view, slashItems, mount } = createListSlashView(`/${id}`)

    try {
      const item = slashItems.find(candidate => candidate.id === id)
      expect(item).toBeTruthy()
      executeListSlash(view, item as NevoSlashItem)

      const listItem = view.state.doc.firstChild?.firstChild
      expect(listItem?.type.name).toBe('list_item')
      expect(listItem?.child(0).type.name).toBe('paragraph')
      expect(listItem?.child(0).textContent).toBe('')
      expect(listItem?.child(1).type.name).toBe(blockType)
      expect(view.state.doc.check()).toBeUndefined()
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('keeps sibling items and parent lists unchanged', () => {
    const schema = nevoBaseSchema
    const core = createCoreCommands(schema)
    const slashItems = createCoreSlashItems(core.commands)
    const doc = schema.node('doc', null, [
      schema.node('bullet_list', null, [
        schema.node('list_item', null, [schema.node('paragraph', null, [schema.text('/code')])]),
        schema.node('list_item', null, [schema.node('paragraph', null, [schema.text('neighbour')])]),
      ]),
    ])
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    let state = EditorState.create({ schema, doc, plugins: [createSlashCommandPlugin(() => slashItems)] })
    state = state.apply(state.tr.setSelection(TextSelection.create(doc, 8)))
    const view = new EditorView(mount, {
      state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const item = slashItems.find(candidate => candidate.id === 'code')
      executeListSlash(view, item as NevoSlashItem)

      const list = view.state.doc.firstChild
      expect(list?.type.name).toBe('bullet_list')
      expect(list?.childCount).toBe(2)
      expect(list?.child(0).child(1).type.name).toBe('code_block')
      expect(list?.child(1).textContent).toBe('neighbour')
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it.each([
    ['ul', 'bullet_list'],
    ['ol', 'ordered_list'],
  ])('creates /%s one level deeper and moves the cursor into its first item', (id, listType) => {
    const { view, slashItems, mount } = createListSlashView(`/${id}`, true)

    try {
      const item = slashItems.find(candidate => candidate.id === id)
      expect(item).toBeTruthy()
      executeListSlash(view, item as NevoSlashItem)

      const outerItem = view.state.doc.firstChild?.firstChild
      const nestedItem = outerItem?.child(1).firstChild
      expect(nestedItem?.type.name).toBe('list_item')
      expect(nestedItem?.child(0).type.name).toBe('paragraph')
      expect(nestedItem?.child(0).textContent).toBe('')
      expect(nestedItem?.child(1).type.name).toBe(listType)
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
      expect(view.state.selection.$from.node(view.state.selection.$from.depth - 1).type.name).toBe('list_item')
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('inserts an inline command in the current list paragraph and round-trips its document JSON', () => {
    const { view, slashItems, mount } = createListSlashView('/math-inline')

    try {
      const item = slashItems.find(candidate => candidate.id === 'math-inline')
      expect(item).toBeTruthy()
      executeListSlash(view, item as NevoSlashItem)

      const listItem = view.state.doc.firstChild?.firstChild
      expect(listItem?.childCount).toBe(1)
      expect(listItem?.child(0).firstChild?.type.name).toBe('math_inline')
      const restored = nevoBaseSchema.nodeFromJSON(view.state.doc.toJSON())
      expect(restored.eq(view.state.doc)).toBe(true)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('uses the opt-in list-aware plugin handler without changing regular plugin command behavior', () => {
    const { view, mount } = createListSlashView('/plugin')
    const regularRun = vi.fn()
    const listRun = vi.fn(({ state, dispatch, list }: Parameters<NonNullable<NevoSlashItem['runInList']>>[0]) => {
      dispatch(state.tr.insertText('plugin', list.paragraphPos + 1))
    })
    const listAwareItem: NevoSlashItem = {
      id: 'plugin',
      title: 'Plugin',
      run: regularRun,
      runInList: listRun,
    }

    try {
      executeListSlash(view, listAwareItem)
      expect(listRun).toHaveBeenCalledOnce()
      expect(regularRun).not.toHaveBeenCalled()
      expect(view.state.doc.textContent).toBe('plugin')
    } finally {
      view.destroy()
      mount.remove()
    }

    const fallback = createListSlashView('/plugin')
    const fallbackRun = vi.fn()
    try {
      executeListSlash(fallback.view, { id: 'plugin', title: 'Plugin', run: fallbackRun })
      expect(fallbackRun).toHaveBeenCalledOnce()
      expect(fallback.view.state.doc.textContent).toBe('')
    } finally {
      fallback.view.destroy()
      fallback.mount.remove()
    }
  })
})
