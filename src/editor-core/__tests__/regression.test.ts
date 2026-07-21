import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EditorView } from 'prosemirror-view'
import { NodeSelection, TextSelection } from 'prosemirror-state'
import type { Node as PMNode } from 'prosemirror-model'
import { createNevoEditorState } from '../state'
import { nevoBaseSchema } from '../schema'
import { parseNoteContentToDoc, serializeDocToNoteContent } from '../serialization'
import { createYDocFromContent, Y_FRAGMENT_NAME } from '../collaboration'
import { createCoreKeymap } from '../keymap'
import type { BlockNode } from '../../types/note'

function dispatchEditorKey(view: EditorView, event: KeyboardEvent): boolean {
  let handled = false
  view.someProp('handleKeyDown', (handler) => {
    if (handled) return
    handled = Boolean(handler(view, event))
  })
  return handled
}

function dispatchTextInput(view: EditorView, text: string): boolean {
  let handled = false
  view.someProp('handleTextInput', (handler) => {
    if (handled) return
    handled = Boolean(handler(view, view.state.selection.from, view.state.selection.to, text, () => view.state.tr.insertText(text)))
  })
  return handled
}

function findTextBlockContentPos(doc: PMNode, text: string): number {
  let found: number | null = null

  doc.descendants((node, pos) => {
    if (found !== null || !node.isTextblock || node.textContent !== text) return true

    found = pos + 1
    return false
  })

  if (found === null) throw new Error(`Text block "${text}" not found`)
  return found
}

function findTextBlockContentPositions(doc: PMNode, text: string): number[] {
  const positions: number[] = []

  doc.descendants((node, pos) => {
    if (node.isTextblock && node.textContent === text) {
      positions.push(pos + 1)
    }
    return true
  })

  return positions
}

function findNodePos(doc: PMNode, typeName: string): number {
  let found: number | null = null

  doc.descendants((node, pos) => {
    if (found !== null || node.type.name !== typeName) return true

    found = pos
    return false
  })

  if (found === null) throw new Error(`Node "${typeName}" not found`)
  return found
}

function createRegressionEditorView(content: BlockNode) {
  const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
  const mount = document.createElement('div')
  document.body.appendChild(mount)

  let view: EditorView
  // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
  view = new EditorView(mount, {
    state: setup.state,
    nodeViews: setup.nodeViews,
    dispatchTransaction(transaction) {
      view.updateState(view.state.apply(transaction))
    },
  })

  return {
    view,
    commands: setup.commands,
    destroy() {
      view.destroy()
      mount.remove()
    },
  }
}

const paragraphAfterSelectedBlockCases: Array<[string, BlockNode]> = [
  ['file_block', { type: 'file_block', attrs: { src: 'file.pdf', filename: 'file.pdf', mime: 'application/pdf', size: 1 } }],
  ['image_block', { type: 'image_block', attrs: { src: 'image.png', alt: '', caption: '', sizePreset: 'medium', width: null, align: 'center' } }],
  ['media_block', { type: 'media_block', attrs: { kind: 'audio', src: 'audio.mp3', name: 'audio.mp3', mime: 'audio/mpeg', size: 1 } }],
  ['embed_block', { type: 'embed_block', attrs: { url: 'https://example.com', title: 'Example' } }],
  [
    'table',
    {
      type: 'table',
      content: [
        {
          type: 'table_row',
          content: [
            { type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell' }] }] },
          ],
        },
      ],
    },
  ],
]

const shiftEnterTextBlockCases: Array<[string, BlockNode, string]> = [
  ['paragraph', { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'paragraph' }] }] }, 'paragraph'],
  ['heading', { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'heading' }] }] }, 'heading'],
  ['checklist item', { type: 'doc', content: [{ type: 'checklist_item', attrs: { checked: false }, content: [{ type: 'text', text: 'checklist' }] }] }, 'checklist'],
  ['bullet list item', {
    type: 'doc',
    content: [{
      type: 'bullet_list',
      content: [{ type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'list' }] }] }],
    }],
  }, 'list'],
  ['blockquote', {
    type: 'doc',
    content: [{
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quote' }] }],
    }],
  }, 'quote'],
  ['callout', {
    type: 'doc',
    content: [{
      type: 'callout',
      attrs: { variant: 'info', icon: '💡' },
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'callout' }] }],
    }],
  }, 'callout'],
  ['toggle title', {
    type: 'doc',
    content: [{
      type: 'toggle',
      attrs: { collapsed: false },
      content: [
        { type: 'toggle_title', content: [{ type: 'text', text: 'toggle' }] },
        { type: 'paragraph' },
      ],
    }],
  }, 'toggle'],
  ['table cell', {
    type: 'doc',
    content: [{
      type: 'table',
      content: [{
        type: 'table_row',
        content: [{ type: 'table_cell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell' }] }] }],
      }],
    }],
  }, 'cell'],
]

describe('editor regression', () => {
  it('does not select a leading media block when opening a note with following text', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'media_block', attrs: { kind: 'audio', name: 'intro.mp3' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })

    expect(setup.state.selection).toBeInstanceOf(TextSelection)
    expect(setup.state.selection).not.toBeInstanceOf(NodeSelection)
    expect(setup.state.selection.$from.parent.textContent).toBe('after')
  })

  it('does not place the initial cursor inside a leading table when following text exists', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'table_row',
              content: [
                {
                  type: 'table_cell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'cell' }] }],
                },
              ],
            },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })

    expect(setup.state.selection).toBeInstanceOf(TextSelection)
    expect(setup.state.selection.$from.parent.textContent).toBe('after')
  })

  it('keeps core hotkeys and undo/redo behavior', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        const editorView: EditorView = view ?? (this as unknown as EditorView)
        editorView.updateState(editorView.state.apply(transaction))
      },
    })

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 6)))

      const boldHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true }),
      )
      expect(boldHandled).toBe(true)
      const strong = view.state.schema.marks.strong
      expect(strong ? view.state.doc.rangeHasMark(2, 6, strong) : false).toBe(true)

      const undoHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
      )
      expect(undoHandled).toBe(true)
      expect(strong ? view.state.doc.rangeHasMark(2, 6, strong) : false).toBe(false)

      const redoShiftHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }),
      )
      expect(redoShiftHandled).toBe(true)
      expect(strong ? view.state.doc.rangeHasMark(2, 6, strong) : false).toBe(true)

      const physicalUndoHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'я', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }),
      )
      expect(physicalUndoHandled).toBe(true)
      expect(strong ? view.state.doc.rangeHasMark(2, 6, strong) : false).toBe(false)

      const physicalRedoHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Я', code: 'KeyZ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }),
      )
      expect(physicalRedoHandled).toBe(true)
      expect(strong ? view.state.doc.rangeHasMark(2, 6, strong) : false).toBe(true)

      const undoAgainHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
      )
      expect(undoAgainHandled).toBe(true)
      expect(strong ? view.state.doc.rangeHasMark(2, 6, strong) : false).toBe(false)

      const redoYHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true, cancelable: true }),
      )
      expect(redoYHandled).toBe(true)
      expect(strong ? view.state.doc.rangeHasMark(2, 6, strong) : false).toBe(true)

      expect(serializeDocToNoteContent(view.state.doc).type).toBe('doc')
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('uses Yjs undo and redo commands when collaborative state is enabled', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    }
    const ydoc = createYDocFromContent(nevoBaseSchema, content)
    const setup = createNevoEditorState({
      schema: nevoBaseSchema,
      content,
      yFragment: ydoc.getXmlFragment(Y_FRAGMENT_NAME),
    })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        const editorView: EditorView = view ?? (this as unknown as EditorView)
        editorView.updateState(editorView.state.apply(transaction))
      },
    })

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6)))
      view.dispatch(view.state.tr.insertText('!'))
      expect(view.state.doc.textContent).toBe('hello!')

      const undoHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'я', code: 'KeyZ', ctrlKey: true, bubbles: true, cancelable: true }),
      )
      expect(undoHandled).toBe(true)
      expect(view.state.doc.textContent).toBe('hello')

      const redoHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Я', code: 'KeyZ', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }),
      )
      expect(redoHandled).toBe(true)
      expect(view.state.doc.textContent).toBe('hello!')
    } finally {
      view.destroy()
      ydoc.destroy()
      mount.remove()
    }
  })

  it('creates a new paragraph after a selected math block on Enter', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'math_block', attrs: { latex: '\\int_0^1 x^2 dx', displayMode: true } },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      nodeViews: setup.nodeViews,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))

      const handled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )

      expect(handled).toBe(true)
      expect(view.state.doc.childCount).toBe(2)
      expect(view.state.doc.child(1).type.name).toBe('paragraph')
      expect(view.state.selection.from).toBeGreaterThan(1)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it.each(paragraphAfterSelectedBlockCases)('creates a new paragraph after a selected %s on Enter', (typeName, block) => {
    const content: BlockNode = {
      type: 'doc',
      content: [block],
    }
    const { view, destroy } = createRegressionEditorView(content)

    try {
      const blockPos = findNodePos(view.state.doc, typeName)
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, blockPos)))

      const handled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )

      expect(handled).toBe(true)
      expect(view.state.doc.childCount).toBe(2)
      expect(view.state.doc.child(0).type.name).toBe(typeName)
      expect(view.state.doc.child(1).type.name).toBe('paragraph')
      expect(view.state.selection).toBeInstanceOf(TextSelection)
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
      expect(view.state.selection.$from.parent.textContent).toBe('')
      expect(view.state.selection.$from.before()).toBe(view.state.doc.child(0).nodeSize)
    } finally {
      destroy()
    }
  })

  it('inserts a new paragraph immediately after a selected file block before existing content', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'file_block', attrs: { src: 'file.pdf', filename: 'file.pdf', mime: 'application/pdf', size: 1 } },
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    }
    const { view, destroy } = createRegressionEditorView(content)

    try {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))

      const handled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )

      expect(handled).toBe(true)
      expect(view.state.doc.childCount).toBe(3)
      expect(view.state.doc.child(0).type.name).toBe('file_block')
      expect(view.state.doc.child(1).type.name).toBe('paragraph')
      expect(view.state.doc.child(1).textContent).toBe('')
      expect(view.state.doc.child(2).type.name).toBe('paragraph')
      expect(view.state.doc.child(2).textContent).toBe('after')
      expect(view.state.selection.$from.before()).toBe(view.state.doc.child(0).nodeSize)
    } finally {
      destroy()
    }
  })

  it.each(['Ctrl-Enter', 'Mod-Enter'] as const)('creates a new paragraph after a selected image block through the %s binding', (bindingKey) => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        { type: 'image_block', attrs: { src: 'image.png', alt: '', caption: '', sizePreset: 'medium', width: null, align: 'center' } },
      ],
    }
    const { view, commands, destroy } = createRegressionEditorView(content)

    try {
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))
      const bindings = createCoreKeymap(nevoBaseSchema, commands)

      expect(bindings[bindingKey]?.(view.state, view.dispatch, view)).toBe(true)
      expect(view.state.doc.childCount).toBe(2)
      expect(view.state.doc.child(1).type.name).toBe('paragraph')
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
    } finally {
      destroy()
    }
  })

  it('keeps regular Enter inside a paragraph splitting the paragraph', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
    }
    const { view, destroy } = createRegressionEditorView(content)

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)))

      const handled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )

      expect(handled).toBe(true)
      expect(view.state.doc.toJSON()).toEqual({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'he' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'llo' }] },
        ],
      })
    } finally {
      destroy()
    }
  })

  it('creates a new list item on Enter from a non-empty list item', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const itemStart = findTextBlockContentPos(view.state.doc, 'item')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, itemStart + 'item'.length)))

      const handled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )

      const list = view.state.doc.firstChild
      expect(handled).toBe(true)
      expect(list?.type.name).toBe('bullet_list')
      expect(list?.childCount).toBe(2)
      expect(list?.child(0).firstChild?.textContent).toBe('item')
      expect(list?.child(1).type.name).toBe('list_item')
      expect(list?.child(1).firstChild?.type.name).toBe('paragraph')
      expect(list?.child(1).firstChild?.textContent).toBe('')
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('exits a list into a paragraph on Enter from an empty list item', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] },
            { type: 'list_item', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const emptyItemStart = findTextBlockContentPos(view.state.doc, '')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, emptyItemStart)))

      const handled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
      )

      expect(handled).toBe(true)
      expect(view.state.doc.childCount).toBe(2)
      expect(view.state.doc.child(0).type.name).toBe('bullet_list')
      expect(view.state.doc.child(0).childCount).toBe(1)
      expect(view.state.doc.child(1).type.name).toBe('paragraph')
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
      expect(view.state.selection.$from.depth).toBe(1)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('adds DOM-only markers to empty bullet list items', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const listItem = mount.querySelector('li')
      expect(listItem?.getAttribute('data-nevo-list-marker')).toBe('•')
      expect(view.state.doc.toJSON()).toEqual(content)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('adds DOM-only numbers to empty ordered list items', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'ordered_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
            { type: 'list_item', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const listItems = mount.querySelectorAll('li')
      expect(listItems[0]?.getAttribute('data-nevo-list-marker')).toBe('1.')
      expect(listItems[1]?.getAttribute('data-nevo-list-marker')).toBe('2.')
      expect(JSON.stringify(view.state.doc.toJSON())).not.toContain('data-nevo-list-marker')
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('uses ordered list start values for DOM-only markers', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'ordered_list',
          attrs: { order: 3 },
          content: [
            { type: 'list_item', content: [{ type: 'paragraph' }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const listItem = mount.querySelector('li')
      expect(listItem?.getAttribute('data-nevo-list-marker')).toBe('3.')
      expect(view.state.doc.toJSON()).toEqual(content)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('inserts a hard break on Ctrl+Enter inside a bullet list item', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const itemStart = findTextBlockContentPos(view.state.doc, 'item')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, itemStart + 'item'.length)))

      const handled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }),
      )

      const list = view.state.doc.firstChild
      expect(handled).toBe(true)
      expect(list?.type.name).toBe('bullet_list')
      expect(list?.childCount).toBe(1)
      expect(list?.child(0).toJSON()).toEqual({
        type: 'list_item',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'item' }, { type: 'hard_break' }] },
        ],
      })
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('inserts a hard break on Ctrl+Enter inside an ordered list item', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'ordered_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const itemStart = findTextBlockContentPos(view.state.doc, 'item')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, itemStart + 'item'.length)))

      const handled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }),
      )

      const list = view.state.doc.firstChild
      expect(handled).toBe(true)
      expect(list?.type.name).toBe('ordered_list')
      expect(list?.childCount).toBe(1)
      expect(list?.child(0).toJSON()).toEqual({
        type: 'list_item',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'item' }, { type: 'hard_break' }] },
        ],
      })
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it.each(shiftEnterTextBlockCases)('inserts a hard break on Shift+Enter inside a %s', (_name, content, text) => {
    const { view, destroy } = createRegressionEditorView(content)

    try {
      const textBlockStart = findTextBlockContentPos(view.state.doc, text)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, textBlockStart + text.length)))

      expect(dispatchEditorKey(view, new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))).toBe(true)
      if (_name === 'paragraph') expect(view.state.doc.childCount).toBe(1)
      expect(view.state.selection.$from.parent.textContent).toBe(text)
      expect(view.state.selection.$from.parent.content.lastChild?.type.name).toBe('hard_break')

      view.dispatch(view.state.tr.insertText('continued'))
      expect(view.state.selection.$from.parent.textContent).toBe(`${text}continued`)
      expect(view.state.selection.$from.parent.childCount).toBe(3)

      const serialized = serializeDocToNoteContent(view.state.doc)
      expect(parseNoteContentToDoc(nevoBaseSchema, serialized).toJSON()).toEqual(serialized)
    } finally {
      destroy()
    }
  })

  it('keeps Shift+Enter inside a code block as a plain text newline', () => {
    const { view, destroy } = createRegressionEditorView({
      type: 'doc',
      content: [{ type: 'code_block', attrs: { language: 'typescript' }, content: [{ type: 'text', text: 'const value' }] }],
    })

    try {
      const codeStart = findTextBlockContentPos(view.state.doc, 'const value')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, codeStart + 'const value'.length)))

      expect(dispatchEditorKey(view, new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))).toBe(true)
      view.dispatch(view.state.tr.insertText('next'))

      expect(view.state.doc.firstChild?.toJSON()).toEqual({
        type: 'code_block',
        attrs: { language: 'typescript' },
        content: [{ type: 'text', text: 'const value\nnext' }],
      })
    } finally {
      destroy()
    }
  })

  it('renders an empty list item paragraph immediately after wrapping an empty paragraph', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))
      const command = setup.commands.get('core.bulletList')
      expect(command?.(view.state, view.dispatch)).toBe(true)

      const listItem = mount.querySelector('li')
      const paragraph = mount.querySelector('li > p')
      expect(listItem).toBeTruthy()
      expect(paragraph).toBeTruthy()
      expect(listItem?.getAttribute('data-nevo-list-marker')).toBe('•')
      expect(paragraph?.textContent).toBe('')

      const editorProseCss = readFileSync('src/styles/editor-prose/prose-text.css', 'utf8')
      expect(editorProseCss).toContain('.doc-editor .nv-prosemirror li > p')
      expect(editorProseCss).toContain('min-height: 1.72em')
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('nests and lifts list items with Tab and Shift-Tab', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'parent' }] }] },
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const childStart = findTextBlockContentPos(view.state.doc, 'child')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, childStart + 'child'.length)))

      const tabHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
      )

      expect(tabHandled).toBe(true)
      expect(view.state.doc.toJSON()).toEqual({
        type: 'doc',
        content: [
          {
            type: 'bullet_list',
            content: [
              {
                type: 'list_item',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'parent' }] },
                  {
                    type: 'bullet_list',
                    content: [
                      { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })

      const nestedChildStart = findTextBlockContentPos(view.state.doc, 'child')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, nestedChildStart + 'child'.length)))

      const shiftTabHandled = dispatchEditorKey(
        view,
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
      )

      expect(shiftTabHandled).toBe(true)
      expect(view.state.doc.toJSON()).toEqual({
        type: 'doc',
        content: [
          {
            type: 'bullet_list',
            content: [
              { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'parent' }] }] },
              { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }] },
            ],
          },
        ],
      })
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('turns markdown list markers in empty list items into nested bullet sublists', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'bullet_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'parent' }] }] },
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: '*' }] }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const markerStart = findTextBlockContentPos(view.state.doc, '*')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, markerStart + 1)))

      expect(dispatchTextInput(view, ' ')).toBe(true)
      expect(view.state.doc.toJSON()).toEqual({
        type: 'doc',
        content: [
          {
            type: 'bullet_list',
            content: [
              {
                type: 'list_item',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'parent' }] },
                  {
                    type: 'bullet_list',
                    content: [
                      { type: 'list_item', content: [{ type: 'paragraph' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
      expect(view.state.selection.$from.parent.textContent).toBe('')
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('turns markdown list markers in empty list items into nested ordered sublists', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'ordered_list',
          content: [
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'parent' }] }] },
            { type: 'list_item', content: [{ type: 'paragraph', content: [{ type: 'text', text: '3.' }] }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const markerStart = findTextBlockContentPos(view.state.doc, '3.')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, markerStart + 2)))

      expect(dispatchTextInput(view, ' ')).toBe(true)
      expect(view.state.doc.toJSON()).toEqual({
        type: 'doc',
        content: [
          {
            type: 'ordered_list',
            attrs: { order: 1 },
            content: [
              {
                type: 'list_item',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'parent' }] },
                  {
                    type: 'ordered_list',
                    attrs: { order: 3 },
                    content: [
                      { type: 'list_item', content: [{ type: 'paragraph' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      })
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('keeps top-level markdown list markers creating normal lists', () => {
    for (const [marker, listType] of [['*', 'bullet_list'], ['1.', 'ordered_list']] as const) {
      const content: BlockNode = {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: marker }] }],
      }

      const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
      const mount = document.createElement('div')
      document.body.appendChild(mount)

      let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
        state: setup.state,
        dispatchTransaction(transaction) {
          view.updateState(view.state.apply(transaction))
        },
      })

      try {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, marker.length + 1)))

        expect(dispatchTextInput(view, ' ')).toBe(true)
        expect(view.state.doc.firstChild?.type.name).toBe(listType)
        expect(view.state.doc.firstChild?.firstChild?.type.name).toBe('list_item')
      } finally {
        view.destroy()
        mount.remove()
      }
    }
  })

  it('handles predictable blockquote line breaks and exits', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'quote' }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const quoteStart = findTextBlockContentPos(view.state.doc, 'quote')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, quoteStart + 'quote'.length)))

      expect(dispatchEditorKey(view, new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))).toBe(true)
      expect(view.state.doc.child(0).child(0).toJSON()).toEqual({
        type: 'paragraph',
        content: [{ type: 'text', text: 'quote' }, { type: 'hard_break' }],
      })

      expect(dispatchEditorKey(view, new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))).toBe(true)
      expect(view.state.doc.childCount).toBe(2)
      expect(view.state.doc.child(0).type.name).toBe('blockquote')
      expect(view.state.doc.child(1).type.name).toBe('paragraph')
      expect(view.state.selection.$from.depth).toBe(1)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('exits blockquotes after two empty paragraphs', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'quote' }] },
            { type: 'paragraph' },
            { type: 'paragraph' },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 11)))

      expect(dispatchEditorKey(view, new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))).toBe(true)
      expect(view.state.doc.toJSON()).toEqual({
        type: 'doc',
        content: [
          {
            type: 'blockquote',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'quote' }] },
            ],
          },
          { type: 'paragraph' },
        ],
      })
      expect(view.state.selection.$from.depth).toBe(1)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('exits toggles on Ctrl+Enter', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'toggle',
          content: [
            { type: 'toggle_title', content: [{ type: 'text', text: 'Toggle' }] },
            { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const bodyStart = findTextBlockContentPos(view.state.doc, 'body')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, bodyStart + 'body'.length)))

      expect(dispatchEditorKey(view, new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }))).toBe(true)
      expect(view.state.doc.toJSON()).toEqual({
        type: 'doc',
        content: [
          {
            type: 'toggle',
            attrs: { collapsed: false },
            content: [
              { type: 'toggle_title', content: [{ type: 'text', text: 'Toggle' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
            ],
          },
          { type: 'paragraph' },
        ],
      })
      expect(view.state.selection.$from.depth).toBe(1)
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('exits toggles after two empty body paragraphs', () => {
    const content: BlockNode = {
      type: 'doc',
      content: [
        {
          type: 'toggle',
          content: [
            { type: 'toggle_title', content: [{ type: 'text', text: 'Toggle' }] },
            { type: 'paragraph' },
            { type: 'paragraph' },
          ],
        },
      ],
    }

    const setup = createNevoEditorState({ schema: nevoBaseSchema, content })
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    let view: EditorView
    // eslint-disable-next-line prefer-const -- must stay `let`: collab plugins dispatch synchronously during construction, so `view` is read while still undefined (see `?? this` fallback below)
    view = new EditorView(mount, {
      state: setup.state,
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const emptyPositions = findTextBlockContentPositions(view.state.doc, '')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, emptyPositions[1])))

      expect(dispatchEditorKey(view, new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))).toBe(true)
      expect(view.state.doc.toJSON()).toEqual({
        type: 'doc',
        content: [
          {
            type: 'toggle',
            attrs: { collapsed: false },
            content: [
              { type: 'toggle_title', content: [{ type: 'text', text: 'Toggle' }] },
              { type: 'paragraph' },
            ],
          },
          { type: 'paragraph' },
        ],
      })
      expect(view.state.selection.$from.depth).toBe(1)
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('renders list marker styles from DOM attributes', () => {
    const editorProseCss = readFileSync('src/styles/editor-prose/prose-text.css', 'utf8')

    expect(editorProseCss).toContain('list-style: none')
    expect(editorProseCss).toContain('.doc-editor .nv-prosemirror li::before')
    expect(editorProseCss).toContain('content: attr(data-nevo-list-marker)')
    expect(editorProseCss).toContain('font-variant-numeric: tabular-nums')
  })

  it('contains editor styles for divider and lower heading levels', () => {
    const editorProseCss = readFileSync('src/styles/editor-prose/prose-text.css', 'utf8')

    expect(editorProseCss).toContain('.doc-editor .nv-prosemirror h5')
    expect(editorProseCss).toContain('.doc-editor .nv-prosemirror h6')
    expect(editorProseCss).toContain('.doc-editor .nv-prosemirror hr[data-nevo-divider]')
    expect(editorProseCss).toContain('.doc-editor .nv-prosemirror hr[data-nevo-divider].ProseMirror-selectednode')
  })
})
