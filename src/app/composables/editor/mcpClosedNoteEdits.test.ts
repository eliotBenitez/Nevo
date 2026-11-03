import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { nevoBaseSchema } from '../../../editor-core/schema'
import type { NoteDocument } from '../../../types/note'
import { clearActiveEditor, registerActiveEditor } from './activeEditorRegistry'
import {
  applyClosedNoteEdit,
  isOpenInEditor,
  persistedRevision,
  readClosedNoteSnapshot,
  writeClosedNoteMarkdown,
} from './mcpClosedNoteEdits'

const mocks = vi.hoisted(() => ({
  noteStore: {
    activeNote: null as { id: string } | null,
    isDirty: false,
    getActiveNoteFormat: vi.fn(() => ({ status: 'document', editable: true })),
    invalidateNoteCache: vi.fn(),
    loadNote: vi.fn(),
  },
  workspaceStore: {
    backend: null as unknown,
    refreshSidebarNotePreviews: vi.fn().mockResolvedValue(undefined),
  },
  treeStore: { syncNoteMeta: vi.fn() },
}))

vi.mock('../../../stores/note', () => ({ useNoteStore: () => mocks.noteStore }))
vi.mock('../../../stores/workspace', () => ({ useWorkspaceStore: () => mocks.workspaceStore }))
vi.mock('../../../stores/tree', () => ({ useTreeStore: () => mocks.treeStore }))

function paragraphDoc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

function storedNote(content: unknown, extra: Partial<NoteDocument> = {}): NoteDocument {
  return {
    id: 'note-2',
    title: 'Closed',
    icon: 'N',
    folderId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    content,
    ...extra,
  } as NoteDocument
}

function createBackend(note: NoteDocument) {
  let stored = note
  return {
    loadNoteWithContent: vi.fn(async () => stored),
    saveNote: vi.fn(async (next: NoteDocument) => { stored = next }),
    get stored() { return stored },
  }
}

describe('mcpClosedNoteEdits', () => {
  beforeEach(() => {
    clearActiveEditor()
    vi.clearAllMocks()
    mocks.noteStore.activeNote = null
    mocks.noteStore.isDirty = false
  })

  it('routes to the live editor only for the open note', () => {
    const view = new EditorView(document.createElement('div'), {
      state: EditorState.create({ schema: nevoBaseSchema }),
    })
    registerActiveEditor(view, 'note-1')

    expect(isOpenInEditor(null)).toBe(true)
    expect(isOpenInEditor('note-1')).toBe(true)
    expect(isOpenInEditor('note-2')).toBe(false)
    view.destroy()
  })

  it('reads a closed note with a revision derived from its saved body', async () => {
    const content = paragraphDoc('Saved text')
    mocks.workspaceStore.backend = createBackend(storedNote(content))

    const snapshot = await readClosedNoteSnapshot('note-2')

    expect(snapshot.noteId).toBe('note-2')
    expect(snapshot.revision).toBe(persistedRevision(content))
    expect(JSON.stringify(snapshot.doc)).toContain('Saved text')
  })

  it('applies an edit to note.json without opening the note', async () => {
    const content = paragraphDoc('Hello')
    const backend = createBackend(storedNote(content))
    mocks.workspaceStore.backend = backend

    const result = await applyClosedNoteEdit({
      noteId: 'note-2',
      revision: persistedRevision(content),
      operations: [{ type: 'insertText', text: ' world', from: 6 }],
    })

    expect(backend.saveNote).toHaveBeenCalledOnce()
    expect(JSON.stringify(backend.stored.content)).toContain('Hello world')
    expect(result.revision).toBe(persistedRevision(backend.stored.content))
    expect(mocks.noteStore.invalidateNoteCache).toHaveBeenCalledWith('note-2')
    expect(mocks.treeStore.syncNoteMeta).toHaveBeenCalledWith('note-2', { title: 'Closed', icon: 'N' }, backend.stored.updatedAt)
    expect(mocks.noteStore.loadNote).not.toHaveBeenCalled()
  })

  it('refuses an edit quoting a revision of an older body', async () => {
    const backend = createBackend(storedNote(paragraphDoc('Changed on disk')))
    mocks.workspaceStore.backend = backend

    await expect(applyClosedNoteEdit({
      noteId: 'note-2',
      revision: persistedRevision(paragraphDoc('Hello')),
      operations: [{ type: 'insertText', text: '!', from: 2 }],
    })).rejects.toThrow(/changed since revision/)
    expect(backend.saveNote).not.toHaveBeenCalled()
  })

  it('appends Markdown to a closed note', async () => {
    const backend = createBackend(storedNote(paragraphDoc('Intro')))
    mocks.workspaceStore.backend = backend

    await writeClosedNoteMarkdown({ noteId: 'note-2', markdown: '## Plan', mode: 'append' })

    const blocks = (backend.stored.content as { content: { type: string }[] }).content
    expect(blocks.map(block => block.type)).toEqual(['paragraph', 'heading'])
  })

  it('never overwrites a note whose content does not parse', async () => {
    const backend = createBackend(storedNote({ type: 'doc', content: [{ type: 'no_such_block' }] }))
    mocks.workspaceStore.backend = backend
    vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(writeClosedNoteMarkdown({ noteId: 'note-2', markdown: 'x', mode: 'append' }))
      .rejects.toThrow(/cannot be edited while it is closed/)
    expect(backend.saveNote).not.toHaveBeenCalled()
  })

  it('refuses handwritten notebooks', async () => {
    const backend = createBackend(storedNote(paragraphDoc(''), {
      documentKind: 'notebook',
      notebook: { version: 1, pages: [] },
    } as Partial<NoteDocument>))
    mocks.workspaceStore.backend = backend

    await expect(writeClosedNoteMarkdown({ noteId: 'note-2', markdown: 'x', mode: 'append' }))
      .rejects.toThrow(/not supported/)
    expect(backend.saveNote).not.toHaveBeenCalled()
  })

  it('refuses a note that is opening but has no editor yet', async () => {
    const backend = createBackend(storedNote(paragraphDoc('Hello')))
    mocks.workspaceStore.backend = backend
    mocks.noteStore.activeNote = { id: 'note-2' }

    await expect(writeClosedNoteMarkdown({ noteId: 'note-2', markdown: 'x', mode: 'append' }))
      .rejects.toThrow(/still opening/)
    expect(backend.loadNoteWithContent).not.toHaveBeenCalled()
  })

  it('refuses to save when the note was opened while it was being read', async () => {
    const backend = createBackend(storedNote(paragraphDoc('Hello')))
    backend.loadNoteWithContent.mockImplementationOnce(async () => {
      mocks.noteStore.activeNote = { id: 'note-2' }
      return backend.stored
    })
    mocks.workspaceStore.backend = backend

    await expect(writeClosedNoteMarkdown({ noteId: 'note-2', markdown: 'x', mode: 'append' }))
      .rejects.toThrow(/was opened while the edit was prepared/)
    expect(backend.saveNote).not.toHaveBeenCalled()
  })

  it('reloads a note opened during the write so the editor shows the new body', async () => {
    const backend = createBackend(storedNote(paragraphDoc('Hello')))
    backend.saveNote.mockImplementationOnce(async () => {
      mocks.noteStore.activeNote = { id: 'note-2' }
    })
    mocks.workspaceStore.backend = backend

    await writeClosedNoteMarkdown({ noteId: 'note-2', markdown: 'x', mode: 'append' })

    expect(mocks.noteStore.loadNote).toHaveBeenCalledWith('note-2', { force: true })
  })
})
