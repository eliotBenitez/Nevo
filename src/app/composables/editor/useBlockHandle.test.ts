import { describe, expect, it } from 'vitest'
import { EditorState, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { mount as mountVue } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nevoBaseSchema } from '../../../editor-core/schema'
import EditorBlockHandle from '../../components/editor/EditorBlockHandle.vue'
import type { EditorCore } from './useEditorCore'
import { createDeleteBlockTransaction, isPointInBlockHandleStickyArea, resolveBlockHandlePosition, resolveBlockTypeMenuPosition, resolveTurnIntoSelectionPos, useBlockHandle } from './useBlockHandle'
import { buildDropTransaction } from '../../../editor-core/dnd/blockDnd'
import en from '../../../locales/en.json'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

describe('resolveBlockHandlePosition', () => {
  it('keeps the handle clear of the active block indicator', () => {
    const position = resolveBlockHandlePosition({ top: 120, left: 240 })

    expect(position).toEqual({ top: 123, left: 212 })
  })

  it('keeps the handle inside the editor boundary', () => {
    const position = resolveBlockHandlePosition({ top: 120, left: 240 }, { left: 210 })

    expect(position).toEqual({ top: 123, left: 246 })
  })
})

describe('isPointInBlockHandleStickyArea', () => {
  it('keeps the handle sticky while the pointer crosses the gap to the block', () => {
    expect(isPointInBlockHandleStickyArea(
      { x: 224, y: 132 },
      { top: 120, right: 420, bottom: 148, left: 240 },
      { top: 123, left: 212 },
    )).toBe(true)
  })

  it('does not keep the handle sticky for points outside the hovered block row', () => {
    expect(isPointInBlockHandleStickyArea(
      { x: 224, y: 170 },
      { top: 120, right: 420, bottom: 148, left: 240 },
      { top: 123, left: 212 },
    )).toBe(false)
  })
})

describe('resolveBlockTypeMenuPosition', () => {
  it('opens the menu above the handle when there is no room below inside the editor bounds', () => {
    const position = resolveBlockTypeMenuPosition(
      { top: 460, left: 180 },
      { width: 220, height: 180 },
      { top: 100, right: 520, bottom: 500, left: 120 },
    )

    expect(position).toEqual({ top: 286, left: 180 })
  })

  it('clamps the menu horizontally so it stays inside the editor bounds', () => {
    const position = resolveBlockTypeMenuPosition(
      { top: 220, left: 420 },
      { width: 220, height: 180 },
      { top: 100, right: 520, bottom: 600, left: 120 },
    )

    expect(position).toEqual({ top: 248, left: 288 })
  })
})

describe('resolveTurnIntoSelectionPos', () => {
  it('uses the first editable block inside a list container', () => {
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('bullet_list', null, [
        schema.node('list_item', null, [
          schema.node('paragraph', null, [schema.text('first')]),
        ]),
      ]),
    ])

    expect(resolveTurnIntoSelectionPos(doc, 0)).toBe(3)
  })

  it('keeps the current editable block when the selection is already inside the hovered list', () => {
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('bullet_list', null, [
        schema.node('list_item', null, [
          schema.node('paragraph', null, [schema.text('first')]),
        ]),
        schema.node('list_item', null, [
          schema.node('paragraph', null, [schema.text('second')]),
        ]),
      ]),
    ])
    expect(resolveTurnIntoSelectionPos(doc, 0, 13)).toBe(13)
  })
})

describe('createDeleteBlockTransaction', () => {
  it('replaces the only deleted block with an empty paragraph', () => {
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 4 }, [schema.text('Title')]),
    ])
    const state = EditorState.create({ schema, doc })
    const tr = createDeleteBlockTransaction(state, 0)

    expect(tr).toBeTruthy()
    const nextDoc = tr?.doc
    expect(nextDoc?.toJSON()).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph' }],
    })
    expect(tr?.selection.$from.parent.type.name).toBe('paragraph')
  })

  it('deletes supported top-level block types and leaves a valid document', () => {
    const schema = nevoBaseSchema
    const paragraph = schema.node('paragraph', null, [schema.text('anchor')])
    const blockNodes = [
      schema.node('paragraph', null, [schema.text('body')]),
      schema.node('heading', { level: 6 }, [schema.text('heading')]),
      schema.node('blockquote', null, [schema.node('paragraph', null, [schema.text('quote')])]),
      schema.node('callout', null, [schema.node('paragraph', null, [schema.text('note')])]),
      schema.node('bullet_list', null, [schema.node('list_item', null, [schema.node('paragraph', null, [schema.text('item')])])]),
      schema.node('ordered_list', null, [schema.node('list_item', null, [schema.node('paragraph', null, [schema.text('item')])])]),
      schema.node('checklist_item', { checked: false }, [schema.text('task')]),
      schema.node('divider'),
      schema.node('code_block', null, [schema.text('code')]),
      schema.node('math_block', { latex: 'x', displayMode: true }),
      schema.node('table', null, [
        schema.node('table_row', null, [
          schema.node('table_cell', null, [schema.node('paragraph', null, [schema.text('cell')])]),
        ]),
      ]),
      schema.node('image_block', { src: 'image.png', alt: '', caption: '', sizePreset: 'medium', width: null, align: 'center' }),
      schema.node('file_block', { src: 'file.pdf', filename: 'file.pdf', mime: 'application/pdf', size: 1 }),
      schema.node('media_block', { kind: 'audio', src: 'audio.mp3', name: 'audio.mp3', mime: 'audio/mpeg', size: 1, duration: null, poster: '' }),
      schema.node('mermaid_block', { code: 'graph TD\nA --> B' }),
      schema.node('note_embed', { noteId: 'n1', title: 'Note', previewText: '' }),
    ]

    for (const blockNode of blockNodes) {
      const doc = schema.node('doc', null, [paragraph, blockNode, paragraph])
      const state = EditorState.create({ schema, doc })
      const pos = paragraph.nodeSize
      const tr = createDeleteBlockTransaction(state, pos)

      expect(tr, blockNode.type.name).toBeTruthy()
      expect(tr?.doc.check()).toBeUndefined()
      expect(tr?.doc.childCount).toBe(2)
      expect(tr?.doc.child(0).type.name).toBe('paragraph')
      expect(tr?.doc.child(1).type.name).toBe('paragraph')
    }
  })

  it('deletes through the block-handle menu handler using the current document node at the hovered position', () => {
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('before')]),
      schema.node('divider'),
      schema.node('paragraph', null, [schema.text('after')]),
    ])
    const mount = document.createElement('div')
    document.body.appendChild(mount)

    const view = new EditorView(mount, {
      state: EditorState.create({ schema, doc }),
      dispatchTransaction(transaction) {
        view.updateState(view.state.apply(transaction))
      },
    })

    try {
      const core = {
        editorView: view,
        commandRegistry: new Map(),
        workspacePath: null,
      } as unknown as EditorCore
      const blockHandle = useBlockHandle(core)
      const dividerPos = doc.child(0).nodeSize
      blockHandle.blockHandle.hoveredBlockPos = dividerPos
      blockHandle.blockHandle.hoveredBlockTypeName = doc.child(1).type.name
      blockHandle.blockHandle.hoveredBlockIconAttrs = null
      blockHandle.blockHandle.visible = true
      blockHandle.blockHandle.typeMenuOpen = true

      blockHandle.deleteBlock()

      expect(view.state.doc.toJSON()).toEqual({
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
        ],
      })
      expect(blockHandle.blockHandle.visible).toBe(false)
      expect(blockHandle.blockHandle.typeMenuOpen).toBe(false)
    } finally {
      view.destroy()
      mount.remove()
    }
  })
})

describe('useBlockHandle drag', () => {
  it('moves the dragged node via an explicit transaction, independent of the live selection', () => {
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('before')]),
      schema.node('table', null, [
        schema.node('table_row', null, [
          schema.node('table_cell', null, [
            schema.node('paragraph', null, [schema.text('cell')]),
          ]),
        ]),
      ]),
      schema.node('paragraph', null, [schema.text('after')]),
    ])

    let state = EditorState.create({ schema, doc })
    const tableNode = doc.child(1)
    const srcFrom = doc.child(0).nodeSize
    const srcTo = srcFrom + tableNode.nodeSize

    // Move the live selection into the table cell — the drop must not depend on it.
    let cellTextPos: number | null = null
    state.doc.descendants((node, pos) => {
      if (cellTextPos !== null || !node.isTextblock || node.textContent !== 'cell') return true
      cellTextPos = pos + 1
      return false
    })
    if (cellTextPos === null) throw new Error('Expected table cell text position')
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, cellTextPos)))

    // Drop the table at the very end of the document.
    const tr = buildDropTransaction(state, tableNode, srcFrom, srcTo, { type: 'vertical', insertAt: state.doc.content.size })
    expect(tr).not.toBeNull()
    state = state.apply(tr!)

    // Moved (not copied): table no longer in the middle, appears exactly once at the end.
    expect(state.doc.childCount).toBe(3)
    expect(state.doc.child(0).textContent).toBe('before')
    expect(state.doc.child(1).textContent).toBe('after')
    expect(state.doc.child(2).type.name).toBe('table')
    expect(state.doc.child(2).textContent).toBe('cell')
  })
})

describe('EditorBlockHandle', () => {
  it('renders heading icons for heading levels 4 through 6', () => {
    for (const level of [4, 5, 6]) {
      const wrapper = mountVue(EditorBlockHandle, {
        props: {
          visible: true,
          position: { top: 0, left: 0 },
          hoveredBlockTypeName: 'heading',
          hoveredBlockIconAttrs: { level },
        },
        global: {
          plugins: [i18n],
        },
      })

      expect(wrapper.find(`.lucide-heading-${level}`).exists()).toBe(true)
      wrapper.unmount()
    }
  })
})
