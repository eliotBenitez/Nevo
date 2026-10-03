import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createEditorCore, useEditorCore } from './useEditorCore'
import { useNoteStore } from '../../../stores/note'
import { useWorkspaceStore } from '../../../stores/workspace'
import { noteCommands } from '../../../tauri/commands'
import { createDefaultWorkspaceSettings } from '../../../utils/workspace-settings'
import { getEditorSession } from '../../../core/document-session/editorSessionRegistry'
import type { NoteDocument } from '../../../types/note'
import type { WorkspaceManifest } from '../../../types/workspace'

// `note.json` is a note's only copy of its content once Phase 4 removed the
// editor's disk-backed Y.Doc — these tests exercise that end to end through a
// real EditorView and the same flush path WorkspaceShell's navigation-away
// watcher uses (`noteStore.saveNote()` -> `persistActiveNote()` -> the
// registered editor session's `flushContent()`), not just the persistence
// helper in isolation.
vi.mock('../../../tauri/commands', () => ({
  noteCommands: {
    saveNote: vi.fn(async () => undefined),
    listSidebarNotePreviews: vi.fn(async () => []),
  },
}))

function createNote(content: NoteDocument['content']): NoteDocument {
  return {
    id: 'note-1',
    title: 'Note',
    icon: '',
    folderId: null,
    createdAt: '2026-09-18T00:00:00.000Z',
    updatedAt: '2026-09-18T00:00:00.000Z',
    content,
  }
}

function buildManifest(): WorkspaceManifest {
  return {
    id: 'ws',
    name: 'WS',
    glyph: 'N',
    gradient: '',
    schemaVersion: 1,
    createdAt: '2026-09-18T00:00:00.000Z',
    rootOrder: ['note-1'],
    tree: [],
    rootNotes: [{ id: 'note-1', title: 'Note', icon: '', folderId: null, updatedAt: '2026-09-18T00:00:00.000Z' }],
  }
}

function createCallbacks(onContentUpdate: (content: NoteDocument['content']) => void) {
  return {
    onOverlaysUpdate: vi.fn(),
    onCloseOverlays: vi.fn(),
    onContentUpdate,
    onInternalLinkOpen: vi.fn(),
    onImagePickerRequest: vi.fn(),
    onImageContextMenuRequest: vi.fn(),
    onFilePickerRequest: vi.fn(),
    onFileOpenRequest: vi.fn(),
    onMathEditRequest: vi.fn(),
    onFormulaEditRequest: vi.fn(),
    onMathInlineInsert: () => false,
    onMathBlockInsert: () => false,
    onSlashMathItemRan: vi.fn(),
    onSlashEmojiPickRequest: vi.fn(),
    onMermaidEditRequest: vi.fn(),
    onQueryEditRequest: vi.fn(),
    onMarkmapEditRequest: vi.fn(),
    onVegaEditRequest: vi.fn(),
    onPluginNodeEditRequest: vi.fn(),
    onCalloutIconPickRequest: vi.fn(),
    onMediaPickerRequest: vi.fn(),
    onNoteEmbedPickRequest: vi.fn(),
    onEmbedUrlRequest: vi.fn(),
    onNoteEmbedOpen: vi.fn(),
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  const workspaceStore = useWorkspaceStore()
  workspaceStore.activeHandle = { kind: 'local', path: '/workspace' }
  workspaceStore.manifest = buildManifest()
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('local note content persistence (real editor + navigation flush)', () => {
  it('flushes an edit made through a real EditorView into note.json when the note store saves on navigation-away', async () => {
    const noteStore = useNoteStore()
    const note = createNote({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Saved text' }] }],
    })
    noteStore.activeNote = note
    noteStore.isDirty = false

    const core = createEditorCore()
    core.workspacePath = '/workspace'
    const editor = useEditorCore(core, createCallbacks((content) => noteStore.setContent(content)))
    const root = document.createElement('div')
    document.body.appendChild(root)
    await editor.setupEditorForNote(note, root, createDefaultWorkspaceSettings())

    try {
      const view = core.editorView!
      view.dispatch(view.state.tr.insertText('Edited: ', 1))

      // The registered editor session is exactly what WorkspaceShell's
      // `watch(activeNoteId, ...)` -> `flushSave()` -> `noteStore.saveNote()`
      // reaches into on navigation; asserting it exists guards against a
      // regression where a note is opened without ever registering one.
      expect(getEditorSession('note-1')).toBeDefined()

      await noteStore.saveNote()

      expect(noteCommands.saveNote).toHaveBeenCalledTimes(1)
      const [savedWorkspacePath, savedNote] = vi.mocked(noteCommands.saveNote).mock.calls[0]!
      expect(savedWorkspacePath).toBe('/workspace')
      expect(savedNote.content.content?.[0]?.content?.[0]?.text).toBe('Edited: Saved text')
      expect(noteStore.isDirty).toBe(false)
    } finally {
      editor.destroyEditorView()
    }
  })

  it('never overwrites a note whose stored content this schema could not parse', async () => {
    const noteStore = useNoteStore()
    const note = createNote({
      type: 'doc',
      content: [{ type: 'totally_unknown_block_type', attrs: { foo: 'bar' } }],
    } as unknown as NoteDocument['content'])
    noteStore.activeNote = note
    noteStore.isDirty = false

    const core = createEditorCore()
    core.workspacePath = '/workspace'
    const onContentUpdate = vi.fn((content: NoteDocument['content']) => noteStore.setContent(content))
    const editor = useEditorCore(core, createCallbacks(onContentUpdate))
    const root = document.createElement('div')
    document.body.appendChild(root)
    await editor.setupEditorForNote(note, root, createDefaultWorkspaceSettings())

    try {
      expect(core.contentPersistenceDisabled).toBe(true)

      const view = core.editorView!
      view.dispatch(view.state.tr.insertText('x', 1))
      editor.flushPendingContentUpdate()

      expect(onContentUpdate).not.toHaveBeenCalled()

      await noteStore.saveNote()
      expect(noteCommands.saveNote).not.toHaveBeenCalled()
    } finally {
      editor.destroyEditorView()
    }
  })
})
