import { describe, expect, it } from 'vitest'
import { Selection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { createNevoEditorState, createSchemaWithPluginExtensions, executeSlashItem, getSlashMenuState, serializeDocToNoteContent } from '..'
import type { BlockNode } from '../../types/note'

const schema = createSchemaWithPluginExtensions()

function createCompactSetup(text: string) {
  const content: BlockNode = {
    type: 'doc',
    content: [
      { type: 'paragraph', content: text ? [{ type: 'text', text }] : [] },
    ],
  }
  const setup = createNevoEditorState({
    schema,
    content,
    enableSlashCommands: true,
    enableMarkdownShortcuts: true,
    tabBehavior: 'indent',
  })
  const cursorPos = text.length > 0 ? 2 + text.length - 1 : 2
  const state = setup.state.apply(setup.state.tr.setSelection(Selection.near(setup.state.doc.resolve(cursorPos))))

  return { ...setup, state }
}

function createCompactView(text: string) {
  const setup = createCompactSetup(text)
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const view = new EditorView(mount, {
    state: setup.state,
    nodeViews: setup.nodeViews,
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction))
    },
  })

  return { ...setup, mount, view }
}

function runSlash(text: string, slashId: string): BlockNode {
  const { mount, slashItems, view } = createCompactView(text)

  try {
    const slashState = getSlashMenuState(view.state)
    const item = slashItems.find((candidate) => candidate.id === slashId)

    expect(item, slashId).toBeTruthy()
    expect(executeSlashItem(view, item as NonNullable<typeof item>, slashState)).toBe(true)
    return serializeDocToNoteContent(view.state.doc)
  } finally {
    view.destroy()
    mount.remove()
  }
}

describe('compact editor state', () => {
  it('uses full slash command set from the main editor', () => {
    const setup = createCompactSetup('/m')
    const ids = setup.slashItems.map((item) => item.id)

    expect(ids).toEqual(expect.arrayContaining([
      'paragraph',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'ul',
      'ol',
      'checklist',
      'code',
      'math',
      'math-inline',
      'quote',
      'callout',
      'toggle',
      'divider',
      'table',
      'image',
      'file',
      'embed',
      'mermaid',
      'markmap',
      'chart',
      'audio',
      'video',
    ]))
  })

  it('opens slash menu and exposes media commands in compact state', () => {
    const setup = createCompactSetup('/table')
    const slashState = getSlashMenuState(setup.state)

    expect(slashState.open).toBe(true)
    expect(slashState.query).toBe('table')
    expect(slashState.itemIds).toContain('table')
  })

  it('serializes heading, divider, table and callout slash results as BlockNode', () => {
    expect(runSlash('/h1', 'h1').content?.[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 1 },
    })

    expect(runSlash('/divider', 'divider').content?.[0]).toMatchObject({
      type: 'divider',
    })

    expect(runSlash('/table', 'table').content?.[0]).toMatchObject({
      type: 'table',
    })

    expect(runSlash('/callout', 'callout').content?.[0]).toMatchObject({
      type: 'callout',
    })
  })
})
