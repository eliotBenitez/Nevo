import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { NoteDocument, NoteSnapshotMeta } from '../types/note'
import { noteCommands } from '../tauri/commands'
import { useNoteStore } from './note'
import { useWorkspaceStore } from './workspace'

vi.mock('../tauri/commands', () => ({
  configCommands: {
    loadAppConfig: vi.fn(),
    saveAppConfig: vi.fn(),
    getAppMetadata: vi.fn(),
  },
  workspaceCommands: {
    createWorkspace: vi.fn(),
    openWorkspace: vi.fn(),
    loadSettings: vi.fn(),
    saveSettings: vi.fn(),
    listPlugins: vi.fn(),
    validatePluginManifest: vi.fn(),
    setPluginEnabled: vi.fn(),
    getWorkspaceDiagnostics: vi.fn(),
    pruneWorkspaceSnapshots: vi.fn(),
    cleanupOrphanedAssets: vi.fn(),
  },
  noteCommands: {
    createNote: vi.fn(),
    loadNote: vi.fn(),
    saveNote: vi.fn(),
    deleteNote: vi.fn(),
    moveNote: vi.fn(),
    listNoteSnapshots: vi.fn(),
    restoreNoteSnapshot: vi.fn(),
    pruneNoteSnapshots: vi.fn(),
    importImageAsset: vi.fn(),
  },
}))

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function createNote(id: string, text: string): NoteDocument {
  return {
    id,
    title: `Note ${id}`,
    icon: '📄',
    folderId: null,
    createdAt: '2026-05-14T10:00:00.000Z',
    updatedAt: '2026-05-14T10:00:00.000Z',
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text,
            },
          ],
        },
      ],
    },
  }
}

function createSnapshot(noteId: string): NoteSnapshotMeta {
  return {
    id: `snapshot-${noteId}`,
    noteId,
    createdAt: '2026-05-14T10:00:00.000Z',
    updatedAt: '2026-05-14T10:00:00.000Z',
  }
}

describe('useNoteStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useWorkspaceStore().activeHandle = { kind: 'local', path: '/workspace' }
  })

  it('clears the previous note immediately and ignores stale load results', async () => {
    const firstLoad = deferred<NoteDocument>()
    const secondLoad = deferred<NoteDocument>()
    const mockedNoteCommands = vi.mocked(noteCommands)

    mockedNoteCommands.loadNote
      .mockImplementationOnce(() => firstLoad.promise)
      .mockImplementationOnce(() => secondLoad.promise)
    mockedNoteCommands.listNoteSnapshots.mockResolvedValue([])

    const noteStore = useNoteStore()
    noteStore.activeNote = createNote('existing', 'Existing text')

    const firstRequest = noteStore.loadNote('note-1')
    expect(noteStore.activeNote).toBeNull()

    const secondRequest = noteStore.loadNote('note-2')

    secondLoad.resolve(createNote('note-2', 'Second note'))
    await secondRequest
    expect(noteStore.activeNote?.id).toBe('note-2')

    firstLoad.resolve(createNote('note-1', 'First note'))
    await firstRequest
    expect(noteStore.activeNote?.id).toBe('note-2')
  })

  it('does not restore the previous note when its save finishes after switching', async () => {
    const saveDone = deferred<void>()
    const mockedNoteCommands = vi.mocked(noteCommands)

    mockedNoteCommands.saveNote.mockImplementation(() => saveDone.promise)
    mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-2', 'Second note'))
    mockedNoteCommands.listNoteSnapshots.mockImplementation(async (_workspacePath, noteId) => {
      return noteId === 'note-1' ? [createSnapshot(noteId)] : []
    })

    const noteStore = useNoteStore()
    noteStore.activeNote = createNote('note-1', 'First note')
    noteStore.isDirty = true
    noteStore.saveStatus = 'unsaved'

    const saveRequest = noteStore.saveNote()
    const loadRequest = noteStore.loadNote('note-2')

    await loadRequest
    expect(noteStore.activeNote?.id).toBe('note-2')

    saveDone.resolve()
    await saveRequest

    expect(noteStore.activeNote?.id).toBe('note-2')
    expect(noteStore.snapshots).toEqual([])
  })

  it('flushes pending editor content before saving', async () => {
    const mockedNoteCommands = vi.mocked(noteCommands)
    mockedNoteCommands.saveNote.mockResolvedValue(undefined)
    mockedNoteCommands.listNoteSnapshots.mockResolvedValue([])

    const noteStore = useNoteStore()
    noteStore.activeNote = createNote('note-1', 'Initial')
    noteStore.isDirty = true
    noteStore.saveStatus = 'unsaved'
    noteStore.setPendingContentFlush(() => {
      noteStore.setContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Latest' }],
          },
        ],
      })
    })

    await noteStore.saveNote()

    expect(mockedNoteCommands.saveNote).toHaveBeenCalledWith(
      '/workspace',
      expect.objectContaining({
        id: 'note-1',
        content: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Latest' }],
            },
          ],
        },
      }),
    )
    expect(noteStore.isDirty).toBe(false)
    noteStore.setPendingContentFlush(null)
  })
})
