import { describe, expect, it } from 'vitest'
import { EditorView } from 'prosemirror-view'
import { Selection, TextSelection } from 'prosemirror-state'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc, serializeDocToNoteContent } from '../serialization'
import { executeSlashItem, getSlashMenuState } from '../slash'
import type { BlockNode } from '../../types/note'

interface TopLevelPosition {
  from: number
  to: number
  contentFrom: number
}

interface BlockPosition {
  from: number
  to: number
  contentFrom: number
}

function getTopLevelPosition(doc: ReturnType<typeof parseNoteContentToDoc>, index: number): TopLevelPosition {
  let pos = 1
  let currentIndex = 0

  for (let i = 0; i < doc.childCount; i += 1) {
    const child = doc.child(i)
    const from = pos
    const to = pos + child.nodeSize

    if (currentIndex === index) {
      return {
        from,
        to,
        contentFrom: from + 1,
      }
    }

    currentIndex += 1
    pos = to
  }

  throw new Error(`Top-level node index ${index} not found`)
}

function findTopLevelPositionByType(doc: ReturnType<typeof parseNoteContentToDoc>, typeName: string): TopLevelPosition {
  let pos = 1

  for (let i = 0; i < doc.childCount; i += 1) {
    const child = doc.child(i)
    const from = pos
    const to = pos + child.nodeSize
    if (child.type.name === typeName) {
      return {
        from,
        to,
        contentFrom: from + 1,
      }
    }
    pos = to
  }

  throw new Error(`Top-level node type ${typeName} not found`)
}

function setSelection(view: EditorView, from: number, to = from) {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
}

function setCursorNear(view: EditorView, pos: number) {
  view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos))))
}

function dispatchEditorKey(view: EditorView, event: KeyboardEvent): boolean {
  let handled = false
  view.someProp('handleKeyDown', (handler) => {
    if (handled) return
    handled = Boolean(handler(view, event))
  })
  return handled
}

function findTextBlockPosition(doc: ReturnType<typeof parseNoteContentToDoc>, text: string): BlockPosition {
  let found: BlockPosition | null = null

  doc.descendants((node, pos) => {
    if (found || !node.isTextblock || node.textContent !== text) return true
    found = {
      from: pos,
      to: pos + node.nodeSize,
      contentFrom: pos + 1,
    }
    return false
  })

  if (!found) {
    throw new Error(`Text block "${text}" not found`)
  }

  return found
}

describe('editor UX e2e', () => {
  it('handles slash, toolbar formatting, links, rich blocks and reopen', () => {
    const initialContent: BlockNode = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: '/h1' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'note block' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'todo item' }] },
      ],
    }

    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content: initialContent,
    })

    const mount = document.createElement('div')
    document.body.appendChild(mount)

    const view = new EditorView(mount, {
      state: setup.state,
      nodeViews: setup.nodeViews,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const firstBlock = getTopLevelPosition(view.state.doc, 0)
      setCursorNear(view, firstBlock.to - 2)
      const slashState = getSlashMenuState(view.state)
      expect(slashState.open).toBe(true)
      const firstSlashId = slashState.itemIds[0]
      expect(firstSlashId).toBe('h1')
      const slashItem = setup.slashItems.find((item) => item.id === firstSlashId)
      expect(slashItem).toBeTruthy()
      executeSlashItem(view, slashItem as NonNullable<typeof slashItem>, slashState)
      expect(view.state.doc.child(0).type.name).toBe('heading')

      const secondBlock = getTopLevelPosition(view.state.doc, 1)
      setSelection(view, secondBlock.contentFrom, secondBlock.contentFrom + 5)
      const boldCommand = setup.commands.get('core.bold')
      expect(boldCommand?.(view.state, view.dispatch.bind(view))).toBe(true)
      const strong = view.state.schema.marks.strong
      expect(strong ? view.state.doc.rangeHasMark(secondBlock.contentFrom, secondBlock.contentFrom + 5, strong) : false).toBe(
        true,
      )

      const setLink = setup.coreCommands.setLink('https://example.com')
      expect(setLink(view.state, view.dispatch.bind(view))).toBe(true)
      const link = view.state.schema.marks.link
      expect(link ? view.state.doc.rangeHasMark(secondBlock.contentFrom, secondBlock.contentFrom + 5, link) : false).toBe(true)

      setSelection(view, secondBlock.contentFrom, secondBlock.contentFrom + 5)
      const updateLink = setup.coreCommands.updateLink('https://nevo.app')
      expect(updateLink(view.state, view.dispatch.bind(view))).toBe(true)

      let updatedHref: string | undefined
      if (link) {
        view.state.doc.nodesBetween(secondBlock.contentFrom, secondBlock.contentFrom + 5, (node) => {
          if (!node.isText || updatedHref) return
          const mark = link.isInSet(node.marks)
          if (mark && typeof mark.attrs.href === 'string') {
            updatedHref = mark.attrs.href
          }
        })
      }
      expect(updatedHref).toBe('https://nevo.app')

      expect(setup.coreCommands.unsetLink(view.state, view.dispatch.bind(view))).toBe(true)
      expect(link ? view.state.doc.rangeHasMark(secondBlock.contentFrom, secondBlock.contentFrom + 5, link) : false).toBe(
        false,
      )

      const thirdBlock = getTopLevelPosition(view.state.doc, 2)
      setSelection(view, thirdBlock.contentFrom, thirdBlock.contentFrom + 4)
      expect(setup.commands.get('core.callout')?.(view.state, view.dispatch.bind(view))).toBe(true)
      expect(view.state.doc.child(2).type.name).toBe('callout')
      expect(view.state.doc.child(2).firstChild?.type.name).toBe('paragraph')

      const paragraphForChecklist = findTopLevelPositionByType(view.state.doc, 'paragraph')
      setSelection(view, paragraphForChecklist.contentFrom, paragraphForChecklist.contentFrom + 3)
      expect(setup.commands.get('core.checklistItem')?.(view.state, view.dispatch.bind(view))).toBe(true)
      expect(view.state.doc.content.content.some((node) => node.type.name === 'checklist_item')).toBe(true)

      const serialized = serializeDocToNoteContent(view.state.doc)
      const reopened = parseNoteContentToDoc(nevoBaseSchema, serialized)
      const types = reopened.content.content.map((node) => node.type.name)

      expect(types).toEqual(expect.arrayContaining(['heading', 'paragraph', 'callout', 'checklist_item']))
      expect(serializeDocToNoteContent(reopened)).toEqual(serialized)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('keeps enter, slash, and block transforms working inside callouts', () => {
    const initialContent: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'info', icon: '💡' },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '/image' }] },
            { type: 'paragraph', content: [{ type: 'text', text: '/table' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'code me' }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content: initialContent,
    })

    const mount = document.createElement('div')
    document.body.appendChild(mount)

    const view = new EditorView(mount, {
      state: setup.state,
      nodeViews: setup.nodeViews,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const firstSlashParagraph = findTextBlockPosition(view.state.doc, '/image')
      setCursorNear(view, firstSlashParagraph.to - 1)
      const firstSlashState = getSlashMenuState(view.state)
      expect(firstSlashState.open).toBe(true)
      expect(firstSlashState.itemIds).toContain('image')

      const leadBlock = findTextBlockPosition(view.state.doc, '/image')
      setCursorNear(view, leadBlock.to - 1)

      const enterHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )
      expect(enterHandled).toBe(true)
      expect(view.state.doc.firstChild?.childCount).toBe(4)
      expect(view.state.doc.firstChild?.child(1).type.name).toBe('paragraph')

      const slashParagraph = findTextBlockPosition(view.state.doc, '/table')
      setCursorNear(view, slashParagraph.to - 1)
      const slashState = getSlashMenuState(view.state)
      expect(slashState.open).toBe(true)
      expect(slashState.itemIds).toContain('table')

      const tableSlashItem = setup.slashItems.find((item) => item.id === 'table')
      expect(tableSlashItem).toBeTruthy()
      executeSlashItem(view, tableSlashItem as NonNullable<typeof tableSlashItem>, slashState)
      expect(view.state.doc.firstChild?.content.content.some((node) => node.type.name === 'table')).toBe(true)

      const codeParagraph = findTextBlockPosition(view.state.doc, 'code me')
      setSelection(view, codeParagraph.contentFrom, codeParagraph.contentFrom + 4)
      expect(setup.commands.get('core.codeBlock')?.(view.state, view.dispatch.bind(view))).toBe(true)
      expect(view.state.doc.firstChild?.content.content.some((node) => node.type.name === 'code_block')).toBe(true)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('routes callout icon clicks through the node-view callback and updates attrs', () => {
    const initialContent: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'info', icon: '💡' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Icon target' }] }],
        },
      ],
    }

    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content: initialContent,
      nodeViewOptions: {
        onRequestCalloutIconPick: ({ position, view }) => {
          const node = view.state.doc.nodeAt(position)
          if (!node) return
          view.dispatch(view.state.tr.setNodeMarkup(position, undefined, { ...node.attrs, icon: '🚀' }))
        },
      },
    })

    const mount = document.createElement('div')
    document.body.appendChild(mount)

    const view = new EditorView(mount, {
      state: setup.state,
      nodeViews: setup.nodeViews,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const iconButton = mount.querySelector<HTMLButtonElement>('.nv-callout-icon')
      expect(iconButton).toBeTruthy()

      iconButton?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
      iconButton?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

      expect(view.state.doc.firstChild?.attrs.icon).toBe('🚀')
    } finally {
      view.destroy()
      mount.remove()
    }
  })
})
