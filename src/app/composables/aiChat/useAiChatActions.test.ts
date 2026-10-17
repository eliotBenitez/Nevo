import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../../../editor-core/schema'

const createNoteMock = vi.fn()
vi.mock('../../../stores/tree', () => ({
  useTreeStore: () => ({
    noteById: new Map([['cur', { id: 'cur', folderId: 'f1' }]]),
    createNote: createNoteMock,
  }),
}))
let format: { status: string } | null = { status: 'document' }
vi.mock('../../../stores/note', () => ({
  useNoteStore: () => ({ activeNote: { id: 'cur' }, getActiveNoteFormat: () => format }),
}))

import { clearActiveEditor, notifyActiveEditorTransaction, registerActiveEditor } from '../editor/activeEditorRegistry'
import { titleFromQuestion, useAiChatActions } from './useAiChatActions'

function openEditor(noteId: string, text = '') {
  const state = EditorState.create({
    doc: nevoBaseSchema.node('doc', null, [nevoBaseSchema.node('paragraph', null, text ? [nevoBaseSchema.text(text)] : [])]),
    schema: nevoBaseSchema,
  })
  const view = new EditorView(document.createElement('div'), {
    state,
    dispatchTransaction(tr) {
      view.updateState(view.state.apply(tr))
      notifyActiveEditorTransaction()
    },
  })
  registerActiveEditor(view, noteId)
  return view
}

describe('useAiChatActions', () => {
  const openNote = vi.fn()
  const openSource = vi.fn()
  beforeEach(() => {
    clearActiveEditor()
    format = { status: 'document' }
    createNoteMock.mockReset()
    openNote.mockReset()
    openSource.mockReset()
  })

  it('insert strips citations before writing', () => {
    const view = openEditor('cur')
    useAiChatActions({ openNote, openSource }).insert('Fact [1][2].')
    expect(view.state.doc.textContent).toBe('Fact.')
  })

  it('insert rejects non-document notes', () => {
    openEditor('cur')
    format = { status: 'notebook' }
    expect(() => useAiChatActions({ openNote, openSource }).insert('x')).toThrow()
  })

  it('replace rewrites the captured selection', () => {
    const view = openEditor('cur', 'one two three')
    useAiChatActions({ openNote, openSource }).replace({ noteId: 'cur', from: 5, to: 8, text: 'two' }, 'TWO [1]')
    expect(view.state.doc.textContent).toBe('one TWO three')
  })

  it('copy writes stripped text to the clipboard', async () => {
    const writeText = vi.fn()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    await useAiChatActions({ openNote, openSource }).copy('a [1]')
    expect(writeText).toHaveBeenCalledWith('a')
  })

  it('createNote makes a note beside the current one, opens it and appends the answer', async () => {
    createNoteMock.mockResolvedValue({ id: 'new' })
    openNote.mockImplementation(() => { openEditor('new') })
    const id = await useAiChatActions({ openNote, openSource }).createNote('Why is the sky blue?\nmore', 'Because [1]')
    expect(createNoteMock).toHaveBeenCalledWith('f1', 'Why is the sky blue?')
    expect(openNote).toHaveBeenCalledWith('new')
    expect(id).toBe('new')
  })

  it('openSource delegates to the shell', () => {
    const source = { n: 1, noteId: 'a', noteTitle: 'A', blockIndex: 3, text: '' }
    useAiChatActions({ openNote, openSource }).openSource(source)
    expect(openSource).toHaveBeenCalledWith(source)
  })

  it('titleFromQuestion takes the first non-empty line, capped at 60', () => {
    expect(titleFromQuestion('\n  hello \nworld')).toBe('hello')
    expect(titleFromQuestion('x'.repeat(100))).toHaveLength(60)
    expect(titleFromQuestion('  ')).toBe('Untitled')
  })
})
