import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { EditorView } from 'prosemirror-view'
import type { EditorCore } from './useEditorCore'
import type { NoteDocument } from '../../../types/note'
import { focusBlockSearchTarget } from '../../components/editor/blockNavigation'
import { useEditorDocumentActions } from './useEditorDocumentActions'

const linkPickerState = vi.hoisted(() => ({
  open: true,
  query: 'Target#heading|Alias',
  range: { from: 2, to: 8 },
}))

vi.mock('../../../editor-core', () => ({
  getLinkPickerState: () => linkPickerState,
  parseWikiQuery: () => ({ anchor: 'heading', alias: 'Alias' }),
}))

vi.mock('../../components/editor/blockNavigation', () => ({
  focusBlockSearchTarget: vi.fn(() => true),
}))

function note(id = 'note-1'): NoteDocument {
  return {
    id,
    title: 'Current',
    icon: '📄',
    folderId: 'folder-1',
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    content: { type: 'doc', content: [] },
  }
}

function linkView() {
  const mark = {}
  const markType = { create: vi.fn(() => mark) }
  const tr = {
    delete: vi.fn(() => tr),
    insertText: vi.fn(() => tr),
    addMark: vi.fn(() => tr),
    removeStoredMark: vi.fn(() => tr),
    scrollIntoView: vi.fn(() => tr),
  }
  const view = {
    state: {
      schema: { marks: { internal_link: markType }, nodes: {} },
      tr,
    },
    dispatch: vi.fn(),
    focus: vi.fn(),
  } as unknown as EditorView
  return { view, tr, markType, mark }
}

function createActions(core: EditorCore, overrides: Record<string, unknown> = {}) {
  const currentNote = note()
  return useEditorDocumentActions({
    core,
    editorRoot: ref(document.createElement('div')),
    getNote: () => currentNote,
    getWorkspaceName: () => 'Workspace',
    getPendingBlockTarget: () => ({
      noteId: currentNote.id,
      blockIndex: 0,
      query: 'Body',
      snippet: 'Body copy',
    }),
    getPendingDrawUpdate: () => null,
    createNote: vi.fn(async () => note('created-note')),
    insertContentAtSelection: vi.fn(() => true),
    flushPendingContentUpdate: vi.fn(),
    closeTemplatePicker: vi.fn(),
    emitConsumedPendingTarget: vi.fn(),
    emitConsumedDrawUpdate: vi.fn(),
    ...overrides,
  })
}

describe('useEditorDocumentActions', () => {
  it('applies an internal link to an existing note', () => {
    const { view, tr, markType, mark } = linkView()
    const actions = createActions({ editorView: view } as EditorCore)

    actions.selectLinkNote({ id: 'target-note', title: 'Target' })

    expect(markType.create).toHaveBeenCalledWith({
      noteId: 'target-note',
      title: 'Target',
      anchor: 'heading',
      alias: 'Alias',
    })
    expect(tr.insertText).toHaveBeenCalledWith('Alias', 2)
    expect(tr.addMark).toHaveBeenCalledWith(2, 7, mark)
    expect(view.dispatch).toHaveBeenCalledWith(tr)
  })

  it('creates a note beside the active note and links to it', async () => {
    const { view, markType } = linkView()
    const createNote = vi.fn(async () => note('created-note'))
    const actions = createActions(
      { editorView: view } as EditorCore,
      { createNote },
    )

    await actions.selectLinkCreateNote({
      noteTitle: 'Created',
      anchor: 'section',
      alias: 'New alias',
    })

    expect(createNote).toHaveBeenCalledWith('folder-1', 'Created')
    expect(markType.create).toHaveBeenCalledWith({
      noteId: 'created-note',
      title: 'Created',
      anchor: 'section',
      alias: 'New alias',
    })
  })

  it('applies the same pending block target only once', async () => {
    const emitConsumedPendingTarget = vi.fn()
    const actions = createActions(
      { editorView: null } as EditorCore,
      { emitConsumedPendingTarget },
    )

    await actions.applyPendingBlockTargetIfReady()
    await actions.applyPendingBlockTargetIfReady()

    expect(focusBlockSearchTarget).toHaveBeenCalledTimes(1)
    expect(emitConsumedPendingTarget).toHaveBeenCalledTimes(1)
  })

  it('sanitizes and updates a pending draw block', () => {
    const drawType = { name: 'draw_block' }
    const drawNode = {
      type: drawType,
      attrs: { drawId: 'draw-1', title: 'Old' },
    }
    const setNodeMarkup = vi.fn((
      _pos: number,
      _nodeType: unknown,
      _attrs: Record<string, unknown>,
    ) => tr)
    const tr = { setNodeMarkup }
    const dispatch = vi.fn()
    const view = {
      state: {
        schema: { nodes: { draw_block: drawType } },
        doc: {
          descendants: (visit: (node: typeof drawNode, pos: number) => void) => visit(drawNode, 3),
          nodeAt: () => drawNode,
        },
        tr,
      },
      dispatch,
    } as unknown as EditorView
    const emitConsumedDrawUpdate = vi.fn()
    const actions = createActions(
      { editorView: view } as EditorCore,
      {
        getPendingDrawUpdate: () => ({
          drawId: 'draw-1',
          svgPreview: '<svg><script>alert(1)</script><path d="M0 0"/></svg>',
          src: '.nevo/assets/draw.json',
          title: 'Updated',
        }),
        emitConsumedDrawUpdate,
      },
    )

    actions.applyPendingDrawUpdateIfReady()

    const attrs = setNodeMarkup.mock.calls[0]?.[2]
    expect(attrs.svgPreview).not.toContain('<script')
    expect(attrs).toMatchObject({
      drawId: 'draw-1',
      src: '.nevo/assets/draw.json',
      title: 'Updated',
    })
    expect(dispatch).toHaveBeenCalledWith(tr)
    expect(emitConsumedDrawUpdate).toHaveBeenCalledOnce()
  })
})
