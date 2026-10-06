import { describe, expect, it, vi } from 'vitest'
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { mount as mountVue } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { nevoBaseSchema } from '../../../editor-core/schema'
import EditorBlockHandle from '../../components/editor/EditorBlockHandle.vue'
import type { EditorCore } from './useEditorCore'
import { createDeleteBlockTransaction, isPointInBlockHandleStickyArea, resolveActiveBlockPos, resolveBlockHandlePosition, resolveBlockTypeMenuPosition, resolveTurnIntoSelectionPos, useBlockHandle } from './useBlockHandle'
import { buildDropTransaction } from '../../../editor-core/dnd/blockDnd'
// Referenceable blocks carry a lazy `id` attr (default null); the canonical
// content shape strips unset ids, so assert through the same normalization the
// persistence path uses rather than baking `id: null` into fixtures.
import { stripNullBlockIds } from '../../../editor-core/serialization'
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

  it('keeps the handle inside the editor boundary when gutter space allows', () => {
    const position = resolveBlockHandlePosition({ top: 120, left: 240 }, { left: 180 })

    expect(position).toEqual({ top: 123, left: 216 })
  })

  it('never pushes the handle to overlap the block when gutter is constrained', () => {
    const position = resolveBlockHandlePosition({ top: 120, left: 240 }, { left: 210 })

    expect(position.left).toBeLessThanOrEqual(240)
    expect(position).toEqual({ top: 123, left: 240 })
  })
})

describe('resolveBlockHandlePosition (coarse pointer)', () => {
  it('places the touch handle above the block, aligned with its content', () => {
    const position = resolveBlockHandlePosition({ top: 300, left: 24, bottom: 330 }, { left: 0, top: 80 }, true)

    expect(position).toEqual({ top: 244, left: 56 })
  })

  it('falls below the block when there is no room above', () => {
    const position = resolveBlockHandlePosition({ top: 90, left: 24, bottom: 120 }, { left: 0, top: 80 }, true)

    expect(position.top).toBe(124)
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

  it('keeps the handle sticky while the pointer is directly over the handle buttons', () => {
    expect(isPointInBlockHandleStickyArea(
      { x: 195, y: 132 },
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
    expect(stripNullBlockIds(nextDoc?.toJSON())).toEqual({
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

      expect(stripNullBlockIds(view.state.doc.toJSON())).toEqual({
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

describe('useBlockHandle mobile controls', () => {
  it.each([
    ['math_block', { latex: 'x^2', displayMode: true }],
    ['draw_block', { drawId: 'draw-1', src: '', svgPreview: '', title: '' }],
    ['mermaid_block', { code: 'graph TD\nA --> B' }],
  ])('inserts an editable paragraph below %s without replacing it', (typeName, attrs) => {
    const schema = nevoBaseSchema
    const block = schema.nodes[typeName]!.create(attrs)
    const doc = schema.node('doc', null, [block])
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
      const handle = useBlockHandle(core)
      handle.blockHandle.hoveredBlockPos = 0
      handle.blockHandle.visible = true

      handle.insertBlockBelow()

      expect(view.state.doc.childCount).toBe(2)
      expect(view.state.doc.child(0).type.name).toBe(typeName)
      expect(view.state.doc.child(1).type.name).toBe('paragraph')
      expect(view.state.selection).toBeInstanceOf(TextSelection)
      expect(view.state.selection.$from.parent.type.name).toBe('paragraph')
      expect(handle.blockHandle.visible).toBe(false)
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('reveals the handle after a short primary touch pointer tap on an atom block', () => {
    vi.useFakeTimers()
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('mermaid_block', { code: 'graph TD\nA --> B' }),
    ])
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const view = new EditorView(mount, {
      state: EditorState.create({ schema, doc }),
    })
    const atomDom = view.nodeDOM(0)
    if (!(atomDom instanceof HTMLElement)) throw new Error('Expected an atom block element')
    vi.spyOn(view, 'posAtCoords').mockReturnValue({ pos: 0, inside: 0 })
    vi.spyOn(atomDom, 'getBoundingClientRect').mockReturnValue({
      top: 80,
      right: 420,
      bottom: 180,
      left: 40,
      width: 380,
      height: 100,
      x: 40,
      y: 80,
      toJSON: () => ({}),
    })

    const createTouchPointerEvent = (type: string) => {
      const event = new Event(type, { bubbles: true })
      Object.defineProperties(event, {
        pointerId: { value: 1 },
        pointerType: { value: 'touch' },
        isPrimary: { value: true },
        button: { value: 0 },
        clientX: { value: 80 },
        clientY: { value: 100 },
      })
      return event
    }

    try {
      const core = {
        editorView: view,
        commandRegistry: new Map(),
        workspacePath: null,
      } as unknown as EditorCore
      const handle = useBlockHandle(core)
      handle.mount()

      atomDom.dispatchEvent(createTouchPointerEvent('pointerdown'))
      atomDom.dispatchEvent(createTouchPointerEvent('pointerup'))
      vi.runAllTimers()

      expect(handle.blockHandle.visible).toBe(true)
      expect(handle.blockHandle.hoveredBlockPos).toBe(0)
      expect(handle.blockHandle.hoveredBlockTypeName).toBe('mermaid_block')
      handle.unmount()
    } finally {
      vi.useRealTimers()
      view.destroy()
      mount.remove()
    }
  })
})

describe('resolveActiveBlockPos', () => {
  it('resolves the block position for text selection in a paragraph', () => {
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('first paragraph')]),
      schema.node('paragraph', null, [schema.text('second paragraph')]),
    ])
    const secondParagraphPos = doc.child(0).nodeSize
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, secondParagraphPos + 3),
    })

    expect(resolveActiveBlockPos(state)).toBe(secondParagraphPos)
  })

  it('resolves the callout container position when the selection is inside callout content', () => {
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('callout', null, [
        schema.node('paragraph', null, [schema.text('inside callout')]),
      ]),
    ])
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 3),
    })

    expect(resolveActiveBlockPos(state)).toBe(0)
  })

  it('resolves the block position for a NodeSelection on an atom block', () => {
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('divider'),
      schema.node('paragraph', null, [schema.text('body')]),
    ])
    const state = EditorState.create({
      schema,
      doc,
      selection: NodeSelection.create(doc, 0),
    })

    expect(resolveActiveBlockPos(state)).toBe(0)
  })
})

describe('useBlockHandle active block', () => {
  it('shows the block handle at the active block when the editor has focus', () => {
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('active line')]),
    ])
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const view = new EditorView(mount, {
      state: EditorState.create({
        schema,
        doc,
        selection: TextSelection.create(doc, 2),
      }),
    })

    const pDom = view.nodeDOM(0) as HTMLElement
    vi.spyOn(pDom, 'getBoundingClientRect').mockReturnValue({
      top: 50,
      right: 300,
      bottom: 80,
      left: 100,
      width: 200,
      height: 30,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    })

    view.focus()

    try {
      const core = {
        editorView: view,
        commandRegistry: new Map(),
        workspacePath: null,
      } as unknown as EditorCore
      const handle = useBlockHandle(core)
      handle.mount()

      expect(handle.blockHandle.visible).toBe(true)
      expect(handle.blockHandle.hoveredBlockPos).toBe(0)
      expect(handle.blockHandle.hoveredBlockTypeName).toBe('paragraph')
      expect(handle.blockHandle.position.top).toBe(53)
      handle.unmount()
    } finally {
      view.destroy()
      mount.remove()
    }
  })

  it('switches handle to hovered block and restores to active block on mouse leave', () => {
    vi.useFakeTimers()
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('first')]),
      schema.node('paragraph', null, [schema.text('second')]),
    ])
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const view = new EditorView(mount, {
      state: EditorState.create({
        schema,
        doc,
        selection: TextSelection.create(doc, 2),
      }),
    })

    const p1Dom = view.nodeDOM(0) as HTMLElement
    const p2Pos = doc.child(0).nodeSize
    const p2Dom = view.nodeDOM(p2Pos) as HTMLElement

    vi.spyOn(p1Dom, 'getBoundingClientRect').mockReturnValue({
      top: 50, right: 300, bottom: 80, left: 100, width: 200, height: 30, x: 100, y: 50, toJSON: () => ({}),
    })
    vi.spyOn(p2Dom, 'getBoundingClientRect').mockReturnValue({
      top: 90, right: 300, bottom: 120, left: 100, width: 200, height: 30, x: 100, y: 90, toJSON: () => ({}),
    })

    view.focus()

    try {
      const core = {
        editorView: view,
        commandRegistry: new Map(),
        workspacePath: null,
      } as unknown as EditorCore
      const handle = useBlockHandle(core)
      handle.mount()

      // Active block is p1
      expect(handle.blockHandle.visible).toBe(true)
      expect(handle.blockHandle.hoveredBlockPos).toBe(0)

      // Hover over p2
      vi.spyOn(view, 'posAtCoords').mockReturnValue({ pos: p2Pos + 1, inside: p2Pos })
      view.dom.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, clientY: 100, bubbles: true }))
      vi.runAllTimers()

      // Handle moved to hovered block (p2)
      expect(handle.blockHandle.visible).toBe(true)
      expect(handle.blockHandle.hoveredBlockPos).toBe(p2Pos)

      // Mouse leaves editor -> handle should revert to active block (p1) because view has focus
      view.dom.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
      vi.runAllTimers()

      expect(handle.blockHandle.visible).toBe(true)
      expect(handle.blockHandle.hoveredBlockPos).toBe(0)

      handle.unmount()
    } finally {
      vi.useRealTimers()
      view.destroy()
      mount.remove()
    }
  })

  it('hides the block handle when editor focus is lost', () => {
    vi.useFakeTimers()
    const schema = nevoBaseSchema
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('first')]),
    ])
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const view = new EditorView(mount, {
      state: EditorState.create({
        schema,
        doc,
        selection: TextSelection.create(doc, 2),
      }),
    })

    const pDom = view.nodeDOM(0) as HTMLElement
    vi.spyOn(pDom, 'getBoundingClientRect').mockReturnValue({
      top: 50, right: 300, bottom: 80, left: 100, width: 200, height: 30, x: 100, y: 50, toJSON: () => ({}),
    })

    view.focus()

    try {
      const core = {
        editorView: view,
        commandRegistry: new Map(),
        workspacePath: null,
      } as unknown as EditorCore
      const handle = useBlockHandle(core)
      handle.mount()

      expect(handle.blockHandle.visible).toBe(true)

      // Editor loses focus
      vi.spyOn(view, 'hasFocus').mockReturnValue(false)
      view.dom.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
      vi.runAllTimers()

      expect(handle.blockHandle.visible).toBe(false)

      handle.unmount()
    } finally {
      vi.useRealTimers()
      view.destroy()
      mount.remove()
    }
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

  it('renders separate button controls for dragging, type options, and insertion', async () => {
    const onInsertBelow = vi.fn()
    const wrapper = mountVue(EditorBlockHandle, {
      props: {
        visible: true,
        position: { top: 0, left: 0 },
        hoveredBlockTypeName: 'paragraph',
        hoveredBlockIconAttrs: null,
        onInsertBelow,
      },
      global: {
        plugins: [i18n],
      },
    })

    const dragButton = wrapper.get('.block-handle__drag')
    const typeButton = wrapper.get('.block-handle__type')
    const insertBelowButton = wrapper.get('.block-handle__insert-below')

    expect(dragButton.attributes('type')).toBe('button')
    expect(typeButton.attributes('type')).toBe('button')

    expect(dragButton.attributes('aria-label')).toBe('Drag to reorder')
    expect(typeButton.attributes('aria-label')).toBe('Block options')
    expect(insertBelowButton.attributes('aria-label')).toBe('Insert block below')
    expect(insertBelowButton.attributes('title')).toBe('Insert block below')
    await insertBelowButton.trigger('click')
    expect(onInsertBelow).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
