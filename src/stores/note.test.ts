import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isReactive } from 'vue'
import type { NoteDocument, NoteMeta, NoteSnapshotMeta } from '../types/note'
import type { WorkspaceManifest } from '../types/workspace'
import { noteCommands } from '../tauri/commands'
import { saveNotebookNote } from '../tauri/notebookSave'
import { useNoteStore } from './note'
import { useWorkspaceStore } from './workspace'
import { LocalBackend } from '../core/workspace-backend/localBackend'
import { registerEditorPersistence, suspendEditorPersistence } from '../core/document-session/editorSessionRegistry'
import type { EditorPersistenceHandle } from '../core/document-session/editorSessionRegistry'
import { createNotebook, type NotebookSnapshotV1 } from '../core/notebook'

vi.mock('../tauri/notebookSave', () => ({
  primeNotebookSave: vi.fn(),
  saveNotebookNote: vi.fn(async () => {}),
}))

// `registerEditorPersistence`/`getEditorSession` are kept real (the tests
// register genuine handles per note id, the way `useEditorCore` does) —
// only `suspendEditorPersistence` is replaced with a spy, so tests can
// assert *that it was called* without it actually invoking a handle's
// `suspend()` (which the tests below don't otherwise need to exercise here).
vi.mock('../core/document-session/editorSessionRegistry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../core/document-session/editorSessionRegistry')>()
  return {
    ...actual,
    suspendEditorPersistence: vi.fn(),
  }
})

function editorSession(overrides: Partial<EditorPersistenceHandle> = {}): EditorPersistenceHandle {
  return {
    suspend: vi.fn(),
    flushContent: vi.fn(),
    ...overrides,
  }
}

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
    listSidebarNotePreviews: vi.fn(),
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

function buildManifestWithNote(meta: NoteMeta): WorkspaceManifest {
  return {
    id: 'ws',
    name: 'WS',
    glyph: 'N',
    gradient: '',
    schemaVersion: 1,
    createdAt: '2026-05-14T10:00:00.000Z',
    rootOrder: [meta.id],
    tree: [],
    rootNotes: [meta],
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
    vi.mocked(noteCommands.listSidebarNotePreviews).mockResolvedValue([])
    useWorkspaceStore().activeHandle = { kind: 'local', path: '/workspace' }
  })

  it('clears the previous note immediately and ignores stale load results', async () => {
    const firstLoad = deferred<NoteDocument>()
    const secondLoad = deferred<NoteDocument>()
    const mockedNoteCommands = vi.mocked(noteCommands)

    mockedNoteCommands.loadNote
      .mockImplementationOnce(() => firstLoad.promise)
      .mockImplementationOnce(() => secondLoad.promise)

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

  it('does not report a save time for a note that was merely opened', async () => {
    // `saveStatus` lands on 'saved' when a note is opened or served from cache too, so
    // the sidebar status bar must not read it as "saved at <time>".
    const mockedNoteCommands = vi.mocked(noteCommands)
    mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-last-saved', 'Body'))

    const noteStore = useNoteStore()
    await noteStore.loadNote('note-last-saved')

    expect(noteStore.saveStatus).toBe('saved')
    expect(noteStore.lastSavedAt).toBeNull()
  })

  it('never calls listNoteSnapshots while loading a note (F11: history is loaded lazily)', async () => {
    // Unique note id: the store's LRU note cache is module-level and outlives
    // individual tests (see 'keeps the note body out of deep reactivity'
    // below), so a shared id here could hide a stale cache hit as a pass.
    const mockedNoteCommands = vi.mocked(noteCommands)
    mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-lazy-snapshots', 'Body'))

    const noteStore = useNoteStore()
    await noteStore.loadNote('note-lazy-snapshots')

    expect(mockedNoteCommands.listNoteSnapshots).not.toHaveBeenCalled()
    expect(noteStore.snapshots).toEqual([])
  })

  it('loadSnapshots populates snapshots for the active note on demand', async () => {
    const mockedNoteCommands = vi.mocked(noteCommands)
    mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-lazy-snapshots-2', 'Body'))
    const snapshot = createSnapshot('note-lazy-snapshots-2')
    mockedNoteCommands.listNoteSnapshots.mockResolvedValue([snapshot])

    const noteStore = useNoteStore()
    await noteStore.loadNote('note-lazy-snapshots-2')
    expect(noteStore.snapshots).toEqual([])

    await noteStore.loadSnapshots('note-lazy-snapshots-2')

    expect(mockedNoteCommands.listNoteSnapshots).toHaveBeenCalledWith('/workspace', 'note-lazy-snapshots-2')
    expect(noteStore.snapshots).toEqual([snapshot])
  })

  it('loadSnapshots discards a stale result for a note switched away from before it resolves', async () => {
    const mockedNoteCommands = vi.mocked(noteCommands)
    const snapshotsRequest = deferred<NoteSnapshotMeta[]>()
    mockedNoteCommands.loadNote
      .mockResolvedValueOnce(createNote('note-lazy-switch-a', 'First'))
      .mockResolvedValueOnce(createNote('note-lazy-switch-b', 'Second'))
    mockedNoteCommands.listNoteSnapshots.mockImplementation(() => snapshotsRequest.promise)

    const noteStore = useNoteStore()
    await noteStore.loadNote('note-lazy-switch-a')
    const snapshotsCall = noteStore.loadSnapshots('note-lazy-switch-a')

    await noteStore.loadNote('note-lazy-switch-b')
    snapshotsRequest.resolve([createSnapshot('note-lazy-switch-a')])
    await snapshotsCall

    expect(noteStore.snapshots).toEqual([])
  })

  it('does not restore the previous note when its save finishes after switching', async () => {
    const saveDone = deferred<void>()
    const mockedNoteCommands = vi.mocked(noteCommands)

    mockedNoteCommands.saveNote.mockImplementation(() => saveDone.promise)
    mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-2', 'Second note'))

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

  it('can force reload a note instead of using the cached document', async () => {
    const mockedNoteCommands = vi.mocked(noteCommands)
    mockedNoteCommands.loadNote
      .mockResolvedValueOnce(createNote('note-force', 'Cached text'))
      .mockResolvedValueOnce(createNote('note-force', 'Imported text'))

    const noteStore = useNoteStore()
    await noteStore.loadNote('note-force')
    expect(noteStore.activeNote?.content.content?.[0]?.content?.[0]?.text).toBe('Cached text')

    await noteStore.loadNote('note-force')
    expect(mockedNoteCommands.loadNote).toHaveBeenCalledTimes(1)
    expect(noteStore.activeNote?.content.content?.[0]?.content?.[0]?.text).toBe('Cached text')

    await noteStore.loadNote('note-force', { force: true })
    expect(mockedNoteCommands.loadNote).toHaveBeenCalledTimes(2)
    expect(noteStore.activeNote?.content.content?.[0]?.content?.[0]?.text).toBe('Imported text')
  })

  it('flushes pending editor content before saving', async () => {
    const mockedNoteCommands = vi.mocked(noteCommands)
    mockedNoteCommands.saveNote.mockResolvedValue(undefined)

    const noteStore = useNoteStore()
    noteStore.activeNote = createNote('note-1', 'Initial')
    noteStore.isDirty = true
    noteStore.saveStatus = 'unsaved'
    const unregister = registerEditorPersistence('note-1', editorSession({
      flushContent: () => {
        noteStore.setContent({
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Latest' }],
            },
          ],
        })
      },
    }))

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
    unregister()
  })

  it('marks note dirty when properties are patched', () => {
    const noteStore = useNoteStore()
    noteStore.activeNote = createNote('note-1', 'Initial')

    noteStore.setPropertiesPatch({ type: 'task', tags: [' work ', '', 'work'], date: '', status: 'active' })

    expect(noteStore.activeNote?.properties).toEqual({
      type: 'task',
      tags: ['work'],
      date: null,
      status: 'active',
    })
    expect(noteStore.isDirty).toBe(true)
    expect(noteStore.saveStatus).toBe('unsaved')
  })

  it('keeps existing properties when applying a partial patch', () => {
    const noteStore = useNoteStore()
    noteStore.activeNote = {
      ...createNote('note-1', 'Initial'),
      properties: {
        type: 'meeting',
        tags: ['team'],
        date: '2026-07-04',
        status: 'draft',
      },
    }

    noteStore.setPropertiesPatch({ status: 'done' })

    expect(noteStore.activeNote?.properties).toEqual({
      type: 'meeting',
      tags: ['team'],
      date: '2026-07-04',
      status: 'done',
    })
  })

  it('preserves unknown note properties through a patch and save', async () => {
    const mockedNoteCommands = vi.mocked(noteCommands)
    mockedNoteCommands.saveNote.mockResolvedValue(undefined)
    const noteStore = useNoteStore()
    noteStore.activeNote = {
      ...createNote('note-future-properties', 'Initial'),
      properties: {
        type: 'task',
        tags: ['team'],
        date: null,
        status: 'active',
        futureNested: { enabled: true },
      },
    }

    noteStore.setPropertiesPatch({ tags: [' updated '] })
    await noteStore.saveNote()

    expect(mockedNoteCommands.saveNote).toHaveBeenCalledWith('/workspace', expect.objectContaining({
      properties: {
        type: 'task',
        tags: ['updated'],
        date: null,
        status: 'active',
        futureNested: { enabled: true },
      },
    }))
  })

  it('keeps note unsaved if properties change while save is in flight', async () => {
    const saveDone = deferred<void>()
    const mockedNoteCommands = vi.mocked(noteCommands)
    mockedNoteCommands.saveNote.mockImplementation(() => saveDone.promise)

    const noteStore = useNoteStore()
    noteStore.activeNote = createNote('note-1', 'Initial')
    noteStore.setPropertiesPatch({ type: 'note' })

    const saveRequest = noteStore.saveNote()
    noteStore.setPropertiesPatch({ type: 'task' })
    saveDone.resolve()
    await saveRequest

    expect(noteStore.activeNote?.properties?.type).toBe('task')
    expect(noteStore.isDirty).toBe(true)
    expect(noteStore.saveStatus).toBe('unsaved')
  })

  it('never lets an earlier-started save race a later one: two overlapping saveNote() calls end up saved and clean', async () => {
    // Regression for F07: without a per-note write queue, two overlapping
    // `backend.saveNote()` calls could resolve in either order, and whichever
    // finished *last* decided the final isDirty/saveStatus — not necessarily
    // the one holding the newest content.
    const mockedNoteCommands = vi.mocked(noteCommands)
    const firstSave = deferred<void>()
    mockedNoteCommands.saveNote.mockImplementationOnce(() => firstSave.promise)
    mockedNoteCommands.saveNote.mockResolvedValueOnce(undefined)

    const noteStore = useNoteStore()
    noteStore.activeNote = createNote('note-race', 'v0')
    noteStore.setTitle('v1')

    // Starts saving immediately (the queue is idle) and blocks on firstSave.
    const save1 = noteStore.saveNote()
    expect(mockedNoteCommands.saveNote).toHaveBeenCalledTimes(1)

    // A second edit + save while the first is still in flight: this request
    // must queue behind the first, not race it.
    noteStore.setTitle('v2')
    const save2 = noteStore.saveNote()
    expect(mockedNoteCommands.saveNote).toHaveBeenCalledTimes(1)

    firstSave.resolve()
    await Promise.all([save1, save2])

    expect(mockedNoteCommands.saveNote).toHaveBeenCalledTimes(2)
    expect(mockedNoteCommands.saveNote).toHaveBeenLastCalledWith('/workspace', expect.objectContaining({ title: 'v2' }))
    expect(noteStore.activeNote?.title).toBe('v2')
    expect(noteStore.isDirty).toBe(false)
    expect(noteStore.saveStatus).toBe('saved')
  })

  it('scopes the note cache to the workspace handle: the same note id in a different workspace never serves stale data', async () => {
    // Regression for F05: the cache used to be keyed by note id alone, so a
    // note id that also exists in another (e.g. cloned) workspace could be
    // served — and then saved over — under the wrong workspace.
    const mockedNoteCommands = vi.mocked(noteCommands)
    mockedNoteCommands.loadNote
      .mockResolvedValueOnce(createNote('shared-id', 'From workspace A'))
      .mockResolvedValueOnce(createNote('shared-id', 'From workspace B'))

    const noteStore = useNoteStore()
    const workspaceStore = useWorkspaceStore()

    workspaceStore.activeHandle = { kind: 'local', path: '/workspace-a' }
    await noteStore.loadNote('shared-id')
    expect(noteStore.activeNote?.content.content?.[0]?.content?.[0]?.text).toBe('From workspace A')

    workspaceStore.activeHandle = { kind: 'local', path: '/workspace-b' }
    await noteStore.loadNote('shared-id')
    expect(mockedNoteCommands.loadNote).toHaveBeenCalledTimes(2)
    expect(noteStore.activeNote?.content.content?.[0]?.content?.[0]?.text).toBe('From workspace B')

    // Switching back to workspace A must not resurrect workspace B's cached
    // copy under A's note id, nor serve A's own cached copy as if it were a
    // fresh load — clearExcept() dropped it when B was loaded, so this is a
    // real (3rd) load from the backend.
    workspaceStore.activeHandle = { kind: 'local', path: '/workspace-a' }
    mockedNoteCommands.loadNote.mockResolvedValueOnce(createNote('shared-id', 'From workspace A again'))
    await noteStore.loadNote('shared-id')
    expect(mockedNoteCommands.loadNote).toHaveBeenCalledTimes(3)
    expect(noteStore.activeNote?.content.content?.[0]?.content?.[0]?.text).toBe('From workspace A again')
  })

  it('syncs the in-memory manifest note entry with the fresh updatedAt after a successful save', async () => {
    const mockedNoteCommands = vi.mocked(noteCommands)
    mockedNoteCommands.saveNote.mockResolvedValue(undefined)

    const workspaceStore = useWorkspaceStore()
    const originalMeta: NoteMeta = {
      id: 'note-1',
      title: 'Note note-1',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-05-14T10:00:00.000Z',
    }
    workspaceStore.manifest = buildManifestWithNote(originalMeta)

    const noteStore = useNoteStore()
    noteStore.activeNote = createNote('note-1', 'Initial')
    noteStore.isDirty = true
    noteStore.saveStatus = 'unsaved'

    await noteStore.saveNote()

    const syncedMeta = workspaceStore.manifest?.rootNotes[0]
    expect(syncedMeta?.updatedAt).not.toBe(originalMeta.updatedAt)
    expect(syncedMeta?.updatedAt).toBe(noteStore.activeNote?.updatedAt)
    expect(syncedMeta?.title).toBe(noteStore.activeNote?.title)
    expect(syncedMeta?.icon).toBe(noteStore.activeNote?.icon)
  })

  it('leaves the manifest note entry untouched when the save is aborted by a stale session', async () => {
    const saveDone = deferred<void>()
    const mockedNoteCommands = vi.mocked(noteCommands)
    mockedNoteCommands.saveNote.mockImplementation(() => saveDone.promise)

    const workspaceStore = useWorkspaceStore()
    const originalMeta: NoteMeta = {
      id: 'note-1',
      title: 'Note note-1',
      icon: '📄',
      folderId: null,
      updatedAt: '2026-05-14T10:00:00.000Z',
    }
    workspaceStore.manifest = buildManifestWithNote(originalMeta)

    const noteStore = useNoteStore()
    noteStore.activeNote = createNote('note-1', 'Initial')
    noteStore.isDirty = true
    noteStore.saveStatus = 'unsaved'

    const saveRequest = noteStore.saveNote()
    // Simulate the note being switched away from mid-save: this bumps the
    // internal session token, so the in-flight save's drift guard must
    // discard its result once it resolves.
    noteStore.clearNote()

    saveDone.resolve()
    await saveRequest

    expect(workspaceStore.manifest?.rootNotes[0]).toEqual(originalMeta)
  })

  it('keeps the note body out of deep reactivity so document walks stay cheap', async () => {
    const mockedNoteCommands = vi.mocked(noteCommands)
    // A note id no other case in this file loads: the store's LRU note cache is
    // module-level and outlives individual tests.
    const loaded = createNote('note-raw', 'Loaded text')
    mockedNoteCommands.loadNote.mockResolvedValue(loaded)

    const noteStore = useNoteStore()
    await noteStore.loadNote('note-raw')

    // Identity must survive: isSameDraft and the editor's reload check compare
    // content by reference.
    expect(noteStore.activeNote?.content).toBe(loaded.content)
    expect(isReactive(noteStore.activeNote?.content)).toBe(false)

    const nextContent = createNote('note-raw', 'Edited text').content
    noteStore.setContent(nextContent)

    expect(noteStore.activeNote?.content).toBe(nextContent)
    expect(isReactive(noteStore.activeNote?.content)).toBe(false)
    expect(noteStore.saveStatus).toBe('unsaved')
  })

  describe('flushDurably', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('returns ok:false when the backend save rejects', async () => {
      const mockedNoteCommands = vi.mocked(noteCommands)
      mockedNoteCommands.saveNote.mockRejectedValue(new Error('disk full'))

      const noteStore = useNoteStore()
      noteStore.activeNote = createNote('note-1', 'Initial')
      noteStore.isDirty = true
      noteStore.saveStatus = 'unsaved'

      const result = await noteStore.flushDurably()

      expect(result).toEqual({ ok: false, error: expect.any(Error) })
      expect(noteStore.saveStatus).toBe('error')
    })

    it('returns ok:false when backend.flushDurability rejects', async () => {
      const mockedNoteCommands = vi.mocked(noteCommands)
      mockedNoteCommands.saveNote.mockResolvedValue(undefined)
      vi.spyOn(LocalBackend.prototype, 'flushDurability').mockRejectedValueOnce(new Error('relay send not drained'))

      const noteStore = useNoteStore()
      noteStore.activeNote = createNote('note-1', 'Initial')
      noteStore.isDirty = true
      noteStore.saveStatus = 'unsaved'

      const result = await noteStore.flushDurably()

      expect(result).toEqual({ ok: false, error: expect.any(Error) })
      expect(noteStore.saveStatus).toBe('error')
    })

    it('returns ok:true and calls backend.flushDurability after a successful save', async () => {
      const mockedNoteCommands = vi.mocked(noteCommands)
      mockedNoteCommands.saveNote.mockResolvedValue(undefined)
      const flushDurabilitySpy = vi.spyOn(LocalBackend.prototype, 'flushDurability').mockResolvedValueOnce(undefined)

      const noteStore = useNoteStore()
      noteStore.activeNote = createNote('note-1', 'Initial')
      noteStore.isDirty = true
      noteStore.saveStatus = 'unsaved'

      const result = await noteStore.flushDurably()

      expect(result).toEqual({ ok: true })
      expect(flushDurabilitySpy).toHaveBeenCalledTimes(1)
      expect(noteStore.saveStatus).toBe('saved')
    })

    it('flushes pending notebook input before deciding whether a save is needed', async () => {
      const noteStore = useNoteStore()
      const snapshot: NotebookSnapshotV1 = {
        ...createNotebook(),
        vendorSnapshot: { source: 'hardware-session' },
      }
      noteStore.activeNote = {
        ...createNote('notebook-pending-input', ''),
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        documentKind: 'notebook',
        notebook: createNotebook(),
      }
      const flushContent = vi.fn(() => { noteStore.setNotebook(snapshot, 'notebook-pending-input') })
      const unregister = registerEditorPersistence('notebook-pending-input', editorSession({ flushContent }))

      const result = await noteStore.flushDurably()

      expect(result).toEqual({ ok: true })
      expect(flushContent).toHaveBeenCalledTimes(1)
      expect(saveNotebookNote).toHaveBeenCalledTimes(1)
      expect(vi.mocked(saveNotebookNote).mock.calls[0]![1]).toMatchObject({
        documentKind: 'notebook',
        notebook: snapshot,
      })
      expect(noteStore.isDirty).toBe(false)
      unregister()
    })

    it('can persist a checkpoint without finishing the active notebook gesture', async () => {
      vi.spyOn(LocalBackend.prototype, 'flushDurability').mockResolvedValue(undefined)
      const noteStore = useNoteStore()
      noteStore.activeNote = {
        ...createNote('notebook-checkpoint', ''),
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        documentKind: 'notebook',
        notebook: createNotebook(),
      }
      noteStore.setNotebook({ ...createNotebook(), checkpoint: 1 }, 'notebook-checkpoint')
      const flushContent = vi.fn()
      const unregister = registerEditorPersistence('notebook-checkpoint', editorSession({ flushContent }))

      await expect(noteStore.flushDurably({ flushEditorSession: false })).resolves.toEqual({ ok: true })

      expect(flushContent).not.toHaveBeenCalled()
      expect(saveNotebookNote).toHaveBeenCalledOnce()
      expect(noteStore.isDirty).toBe(false)
      unregister()
    })

    it('returns ok:false when a newer revision remains dirty after durability flush', async () => {
      vi.spyOn(LocalBackend.prototype, 'flushDurability').mockResolvedValueOnce(undefined)
      const mockedNoteCommands = vi.mocked(noteCommands)
      const noteStore = useNoteStore()
      noteStore.activeNote = createNote('notebook-revision-during-flush', 'Initial')
      noteStore.markContentDirty()
      mockedNoteCommands.saveNote.mockImplementationOnce(async () => {
        noteStore.setContent(createNote('notebook-revision-during-flush', 'Late input').content)
      })

      const result = await noteStore.flushDurably()

      expect(result.ok).toBe(false)
      expect(noteStore.isDirty).toBe(true)
      expect(noteStore.saveStatus).toBe('unsaved')
    })

    it('returns ok:true without a backend call when there is no active workspace', async () => {
      useWorkspaceStore().activeHandle = null
      const noteStore = useNoteStore()

      const result = await noteStore.flushDurably()

      expect(result).toEqual({ ok: true })
    })
  })

  describe('setNotebook', () => {
    it('accepts an immutable raw notebook only for the active valid notebook note', () => {
      const noteStore = useNoteStore()
      const note = {
        ...createNote('notebook-store-1', ''),
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        documentKind: 'notebook' as const,
        notebook: createNotebook(),
      }
      noteStore.activeNote = note
      const snapshot = { ...createNotebook(), vendorSnapshot: { keep: true } }

      expect(noteStore.setNotebook(snapshot, note.id)).toBe(true)
      expect(noteStore.activeNote?.notebook).toBe(snapshot)
      expect(isReactive(noteStore.activeNote?.notebook)).toBe(false)
      expect(noteStore.isDirty).toBe(true)
      expect(noteStore.setNotebook(createNotebook(), 'another-note')).toBe(false)
      expect(noteStore.activeNote?.notebook).toBe(snapshot)
    })

    it('refuses to mutate unsupported notebook data and does not schedule autosave', () => {
      const noteStore = useNoteStore()
      noteStore.activeNote = {
        ...createNote('notebook-future-version', ''),
        content: { type: 'doc', content: [] },
        documentKind: 'notebook',
        notebook: { version: 2, pages: [] } as unknown as NotebookSnapshotV1,
      }

      expect(noteStore.setNotebook(createNotebook(), 'notebook-future-version')).toBe(false)
      noteStore.setTitle('Changed')
      expect(noteStore.activeNote?.title).toBe('Note notebook-future-version')
      expect(noteStore.isDirty).toBe(false)
      expect(noteStore.saveStatus).toBe('saved')
    })
  })

  describe('restoreSnapshot', () => {
    afterEach(() => {
      vi.restoreAllMocks()
      vi.mocked(suspendEditorPersistence).mockClear()
    })

    it('on the active note: flushes pending writes, suspends editor persistence, calls the backend, and force-reloads', async () => {
      const mockedNoteCommands = vi.mocked(noteCommands)
      mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-1', 'Reloaded from disk'))
      const restored = createNote('note-1', 'Restored content')
      const restoreSpy = vi.spyOn(LocalBackend.prototype, 'restoreNoteSnapshot')
        .mockResolvedValue({ note: restored, recoverySnapshotId: 'rec-1', warnings: [] })

      const noteStore = useNoteStore()
      noteStore.activeNote = createNote('note-1', 'Before restore')
      const contentFlush = vi.fn(async () => {})
      const unregister = registerEditorPersistence('note-1', editorSession({ flushContent: contentFlush }))

      const result = await noteStore.restoreSnapshot('note-1', 'snapshot-1')

      expect(contentFlush).toHaveBeenCalledTimes(1)
      expect(suspendEditorPersistence).toHaveBeenCalledWith('note-1')
      expect(restoreSpy).toHaveBeenCalledWith('note-1', 'snapshot-1')
      expect(result.note).toBe(restored)
      // Force-reloads from disk afterward instead of trusting in-memory state.
      expect(mockedNoteCommands.loadNote).toHaveBeenCalledWith('/workspace', 'note-1')
      expect(noteStore.activeNote?.content.content?.[0]?.content?.[0]?.text).toBe('Reloaded from disk')

      unregister()
    })

    it('rethrows on backend failure and still force-reloads the active note', async () => {
      const mockedNoteCommands = vi.mocked(noteCommands)
      mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-1', 'Reloaded from disk'))
      vi.spyOn(LocalBackend.prototype, 'restoreNoteSnapshot').mockRejectedValue(new Error('disk full'))

      const noteStore = useNoteStore()
      noteStore.activeNote = createNote('note-1', 'Before restore')

      await expect(noteStore.restoreSnapshot('note-1', 'snapshot-1')).rejects.toThrow('disk full')

      // The reload still runs even though the restore itself failed, so the
      // editor never keeps a suspended persistence that was never re-attached.
      expect(mockedNoteCommands.loadNote).toHaveBeenCalledWith('/workspace', 'note-1')
    })

    it('does not suspend or reload for a note other than the active one, but invalidates its cache', async () => {
      const mockedNoteCommands = vi.mocked(noteCommands)
      mockedNoteCommands.loadNote.mockResolvedValueOnce(createNote('note-cache-test', 'Cached'))
      const noteStore = useNoteStore()
      await noteStore.loadNote('note-cache-test')
      mockedNoteCommands.loadNote.mockClear()

      const restored = createNote('note-cache-test', 'Restored content')
      vi.spyOn(LocalBackend.prototype, 'restoreNoteSnapshot')
        .mockResolvedValue({ note: restored, recoverySnapshotId: 'rec-1', warnings: [] })
      noteStore.activeNote = createNote('note-1', 'Unrelated active note')

      const result = await noteStore.restoreSnapshot('note-cache-test', 'snapshot-1')

      expect(suspendEditorPersistence).not.toHaveBeenCalled()
      expect(result.note).toBe(restored)
      // restoreSnapshot itself never reloads a note that is not active.
      expect(mockedNoteCommands.loadNote).not.toHaveBeenCalled()

      mockedNoteCommands.loadNote.mockResolvedValueOnce(createNote('note-cache-test', 'From disk'))
      await noteStore.loadNote('note-cache-test')
      // The cache was invalidated by the restore, so this load hits the
      // backend instead of being served from the stale cached entry.
      expect(mockedNoteCommands.loadNote).toHaveBeenCalledTimes(1)
    })

    it('persists a dirty active note before restoring', async () => {
      const mockedNoteCommands = vi.mocked(noteCommands)
      const order: string[] = []
      mockedNoteCommands.saveNote.mockImplementation(async () => { order.push('save') })
      mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-1', 'Reloaded'))
      vi.spyOn(LocalBackend.prototype, 'restoreNoteSnapshot').mockImplementation(async () => {
        order.push('restore')
        return { note: createNote('note-1', 'Restored'), recoverySnapshotId: 'rec-1', warnings: [] }
      })
      const noteStore = useNoteStore()
      noteStore.activeNote = createNote('note-1', 'Saved')
      noteStore.setContent({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unsaved edit' }] }] })

      await noteStore.restoreSnapshot('note-1', 'snapshot-1')

      expect(order).toEqual(['save', 'restore'])
      const saved = mockedNoteCommands.saveNote.mock.calls[0]![1] as NoteDocument
      expect(saved.content.content?.[0]?.content?.[0]?.text).toBe('Unsaved edit')
    })

    it('does not call the backend restore when the pre-restore save fails', async () => {
      const mockedNoteCommands = vi.mocked(noteCommands)
      mockedNoteCommands.saveNote.mockRejectedValue(new Error('disk full'))
      mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-1', 'Reloaded'))
      const restoreSpy = vi.spyOn(LocalBackend.prototype, 'restoreNoteSnapshot')
      const noteStore = useNoteStore()
      noteStore.activeNote = createNote('note-1', 'Saved')
      noteStore.markContentDirty()

      await expect(noteStore.restoreSnapshot('note-1', 'snapshot-1')).rejects.toThrow('disk full')

      expect(restoreSpy).not.toHaveBeenCalled()
      expect(suspendEditorPersistence).not.toHaveBeenCalled()
    })

    it('waits for an in-flight save before restoring', async () => {
      const mockedNoteCommands = vi.mocked(noteCommands)
      const inFlight = deferred<void>()
      mockedNoteCommands.saveNote.mockReturnValueOnce(inFlight.promise)
      mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-1', 'Reloaded'))
      const restoreSpy = vi.spyOn(LocalBackend.prototype, 'restoreNoteSnapshot')
        .mockResolvedValue({ note: createNote('note-1', 'Restored'), recoverySnapshotId: 'rec-1', warnings: [] })
      const noteStore = useNoteStore()
      noteStore.activeNote = createNote('note-1', 'Saved')
      noteStore.markContentDirty()
      const autosave = noteStore.saveNote()

      const restoring = noteStore.restoreSnapshot('note-1', 'snapshot-1')
      await Promise.resolve(); await Promise.resolve()
      expect(restoreSpy).not.toHaveBeenCalled()

      inFlight.resolve()
      await autosave
      await restoring
      expect(restoreSpy).toHaveBeenCalledTimes(1)
    })

    it('a stale autosave tick after restore does not overwrite the restored note', async () => {
      const mockedNoteCommands = vi.mocked(noteCommands)
      mockedNoteCommands.saveNote.mockResolvedValue(undefined)
      mockedNoteCommands.loadNote.mockResolvedValue(createNote('note-1', 'Restored from disk'))
      vi.spyOn(LocalBackend.prototype, 'restoreNoteSnapshot')
        .mockResolvedValue({ note: createNote('note-1', 'Restored'), recoverySnapshotId: 'rec-1', warnings: [] })
      const noteStore = useNoteStore()
      noteStore.activeNote = createNote('note-1', 'Saved')
      noteStore.markContentDirty()

      await noteStore.restoreSnapshot('note-1', 'snapshot-1')
      mockedNoteCommands.saveNote.mockClear()
      await noteStore.saveNote() // what useNotePersistence's timer would do

      expect(mockedNoteCommands.saveNote).not.toHaveBeenCalled()
      expect(noteStore.activeNote?.content.content?.[0]?.content?.[0]?.text).toBe('Restored from disk')
    })
  })
})
