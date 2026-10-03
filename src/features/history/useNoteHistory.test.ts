import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent, reactive, ref } from 'vue'
import en from '../../locales/en.json'
import type { NoteDocument, NoteSnapshotMeta, RestoreNoteSnapshotResult } from '../../types/note'
import { useNoteHistory } from './useNoteHistory'
import { createNotebook } from '../../core/notebook'

// Same mocking shape as HistoryView.test.ts — see useNoteHistory.ts for why
// the "current note" reads noteStore.activeNote instead of loading separately.
const backend = {
  listNoteSnapshots: vi.fn(),
  loadNoteSnapshot: vi.fn(),
  saveNote: vi.fn(),
}

const noteStoreMock = reactive<{ activeNote: NoteDocument | null }>({ activeNote: null })
const restoreSnapshot = vi.fn()
const invalidateNoteCache = vi.fn()
const createTreeNote = vi.fn()
const createTreeNotebook = vi.fn()
const deleteNote = vi.fn()
const permanentlyDeleteFromTrash = vi.fn()
const syncNoteMeta = vi.fn()
const refreshSidebarNotePreviews = vi.fn()

vi.mock('../../stores/workspace', () => ({
  useWorkspaceStore: () => ({
    backend,
    settings: { files: { snapshotRetentionCount: 50 } },
    getRelativeTime: (value: string) => `relative:${value}`,
    refreshSidebarNotePreviews,
  }),
}))

vi.mock('../../stores/note', () => ({
  useNoteStore: () => ({
    get activeNote() { return noteStoreMock.activeNote },
    restoreSnapshot: (...args: [string, string]) => restoreSnapshot(...args),
    invalidateNoteCache,
  }),
}))

vi.mock('../../stores/tree', () => ({
  useTreeStore: () => ({
    noteById: new Map([
      ['note-1', { id: 'note-1', title: 'Note One', icon: '1', folderId: 'folder-1', updatedAt: '2026-05-14T10:00:00.000Z' }],
    ]),
    createNote: (...args: [string | null, string, string]) => createTreeNote(...args),
    createNotebook: (...args: [string | null, string, string, 'plain' | 'grid' | 'ruled']) => createTreeNotebook(...args),
    deleteNote: (...args: [string]) => deleteNote(...args),
    permanentlyDeleteFromTrash: (...args: [string]) => permanentlyDeleteFromTrash(...args),
    syncNoteMeta: (...args: unknown[]) => syncNoteMeta(...args),
  }),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function createNote(id: string, text: string, overrides: Partial<NoteDocument> = {}): NoteDocument {
  return {
    id,
    title: 'Note One',
    icon: '1',
    folderId: null,
    createdAt: '2026-05-14T10:00:00.000Z',
    updatedAt: '2026-05-14T10:00:00.000Z',
    content: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    },
    ...overrides,
  }
}

function createSnapshots(): NoteSnapshotMeta[] {
  return [
    { id: 'snap-new', noteId: 'note-1', createdAt: '2026-05-14T12:00:00.000Z', updatedAt: '2026-05-14T11:00:00.000Z' },
    { id: 'snap-old', noteId: 'note-1', createdAt: '2026-05-14T09:00:00.000Z', updatedAt: '2026-05-14T08:00:00.000Z' },
  ]
}

function restoreResult(overrides: Partial<RestoreNoteSnapshotResult> = {}): RestoreNoteSnapshotResult {
  return {
    note: createNote('note-1', 'Restored body'),
    recoverySnapshotId: 'snap-pre-restore',
    warnings: [],
    ...overrides,
  }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

// No withSetup helper exists in the repo yet (checked via grep), so mount a
// tiny host component to give useI18n() an active instance.
function withSetup(noteId = 'note-1') {
  let result!: ReturnType<typeof useNoteHistory>
  const noteIdRef = ref(noteId)
  const wrapper = mount(defineComponent({
    setup() {
      result = useNoteHistory(noteIdRef)
      return () => null
    },
  }), { global: { plugins: [i18n] } })
  return { result, wrapper, noteIdRef }
}

describe('useNoteHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    noteStoreMock.activeNote = createNote('note-1', 'Current body')
    backend.listNoteSnapshots.mockImplementation(async () => createSnapshots())
    backend.loadNoteSnapshot.mockImplementation(async (_noteId: string, snapshotId: string) =>
      createNote('note-1', snapshotId === 'snap-new' ? 'Newer snapshot body' : 'Older snapshot body'))
    backend.saveNote.mockResolvedValue(undefined)
    restoreSnapshot.mockResolvedValue(restoreResult())
    createTreeNote.mockResolvedValue(createNote('note-copy', ''))
    createTreeNotebook.mockResolvedValue(createNote('note-copy', '', {
      documentKind: 'notebook',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      notebook: createNotebook('ruled'),
    }))
    deleteNote.mockResolvedValue(undefined)
    permanentlyDeleteFromTrash.mockResolvedValue(undefined)
    refreshSidebarNotePreviews.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('closes the confirmation when another version is selected', async () => {
    const { result } = withSetup()
    await flush()

    expect(result.selectedSnapshotId.value).toBe('snap-new')
    result.requestRestore()
    expect(result.confirmation.value?.snapshotId).toBe('snap-new')

    result.selectSnapshot('snap-old')
    await flush()
    expect(result.confirmation.value).toBeNull()

    await result.confirmRestore()
    expect(restoreSnapshot).not.toHaveBeenCalled()
  })

  it('provides vector page previews for notebook snapshots', async () => {
    const snapshot = createNote('note-1', '', {
      documentKind: 'notebook',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      notebook: createNotebook('grid'),
    })
    backend.loadNoteSnapshot.mockResolvedValueOnce(snapshot)

    const { result } = withSetup()
    await flush()

    expect(result.notebookPreviewPages.value).toHaveLength(1)
    expect(result.notebookPreviewPages.value[0]?.source).toContain('data:image/svg+xml')
    expect(result.notebookPreviewPages.value[0]?.alt).toContain('Page 1')
  })

  it('confirmRestore restores the bound snapshot', async () => {
    const { result } = withSetup()
    await flush()

    result.requestRestore()
    expect(result.confirmation.value?.snapshotId).toBe('snap-new')

    await result.confirmRestore()
    expect(restoreSnapshot).toHaveBeenCalledWith('note-1', 'snap-new')
  })

  it('cannot request restore while the snapshot is loading or failed', async () => {
    let resolveLoad!: (value: NoteDocument) => void
    backend.loadNoteSnapshot.mockImplementation(() => new Promise<NoteDocument>(resolve => { resolveLoad = resolve }))

    const { result } = withSetup()
    await flush()

    expect(result.selectedSnapshotLoaded.value).toBe(false)
    result.requestRestore()
    expect(result.confirmation.value).toBeNull()

    resolveLoad(createNote('note-1', 'Newer snapshot body'))
    await flush()
    expect(result.selectedSnapshotLoaded.value).toBe(true)

    // Now exercise the rejected path on a fresh instance.
    backend.loadNoteSnapshot.mockImplementation(async () => { throw new Error('boom') })
    const second = withSetup()
    await flush()

    expect(second.result.selectedSnapshotLoaded.value).toBe(false)
    second.result.requestRestore()
    expect(second.result.confirmation.value).toBeNull()
  })

  it('selects the recovery snapshot after a successful restore', async () => {
    restoreSnapshot.mockResolvedValue(restoreResult({ recoverySnapshotId: 'snap-rec' }))
    backend.listNoteSnapshots.mockImplementation(async () => [
      { id: 'snap-rec', noteId: 'note-1', createdAt: '2026-05-14T13:00:00.000Z', updatedAt: '2026-05-14T13:00:00.000Z' },
      ...createSnapshots(),
    ])

    const { result } = withSetup()
    await flush()

    result.requestRestore()
    await result.confirmRestore()
    await flush()

    expect(result.selectedSnapshotId.value).toBe('snap-rec')
    expect(result.recoverySnapshotId.value).toBe('snap-rec')
  })

  it('does not overwrite a selection made while the restore is in flight', async () => {
    let resolveRestore!: (value: RestoreNoteSnapshotResult) => void
    restoreSnapshot.mockImplementation(() => new Promise<RestoreNoteSnapshotResult>(resolve => { resolveRestore = resolve }))

    const { result } = withSetup()
    await flush()

    result.requestRestore()
    const confirmPromise = result.confirmRestore()

    // The user browses to another version while the restore is still in flight.
    result.selectSnapshot('snap-old')

    resolveRestore(restoreResult({ recoverySnapshotId: 'snap-rec' }))
    await confirmPromise
    await flush()

    expect(result.selectedSnapshotId.value).toBe('snap-old')
    expect(result.recoverySnapshotId.value).toBe('snap-rec')
  })

  it('does not overwrite a selection made while reloading snapshots after restore', async () => {
    let resolveReload!: (snapshots: NoteSnapshotMeta[]) => void
    backend.listNoteSnapshots
      .mockImplementationOnce(async () => createSnapshots())
      .mockImplementationOnce(() => new Promise<NoteSnapshotMeta[]>(resolve => { resolveReload = resolve }))
    restoreSnapshot.mockResolvedValue(restoreResult({ recoverySnapshotId: 'snap-rec' }))

    const { result } = withSetup()
    await flush()
    result.requestRestore()

    const confirmPromise = result.confirmRestore()
    await flush()
    result.selectSnapshot('snap-old')
    resolveReload([
      { id: 'snap-rec', noteId: 'note-1', createdAt: '2026-05-14T13:00:00.000Z', updatedAt: '2026-05-14T13:00:00.000Z' },
      ...createSnapshots(),
    ])
    await confirmPromise

    expect(result.selectedSnapshotId.value).toBe('snap-old')
  })

  it('clears restore success when the note changes', async () => {
    const { result, noteIdRef } = withSetup()
    await flush()

    result.requestRestore()
    await result.confirmRestore()
    expect(result.restoreSucceeded.value).toBe(true)

    noteIdRef.value = 'note-2'
    await flush()

    expect(result.restoreSucceeded.value).toBe(false)
  })

  it('tracks restoreSucceeded across a successful restore, a reselect, and a retry', async () => {
    const { result } = withSetup()
    await flush()

    expect(result.restoreSucceeded.value).toBe(false)

    result.requestRestore()
    await result.confirmRestore()
    expect(result.restoreSucceeded.value).toBe(true)

    // Moving on to browse another version retires the stale announcement.
    result.selectSnapshot('snap-old')
    expect(result.restoreSucceeded.value).toBe(false)

    result.selectSnapshot('snap-new')
    await flush()
    result.requestRestore()
    restoreSnapshot.mockRejectedValueOnce(new Error('disk full'))
    await result.confirmRestore()
    expect(result.restoreSucceeded.value).toBe(false)
    expect(result.restoreError.value).toBeTruthy()

    // Retrying the same bound confirmation succeeds.
    await result.confirmRestore()
    expect(result.restoreSucceeded.value).toBe(true)
  })

  it('reports post-commit warnings without calling the restore a failure', async () => {
    restoreSnapshot.mockResolvedValue(restoreResult({ warnings: ['pruneFailed'] }))

    const { result } = withSetup()
    await flush()

    result.requestRestore()
    await result.confirmRestore()

    expect(result.restoreError.value).toBeNull()
    expect(result.restoreWarning.value).toBe(en.workspace.history.restoreWarning)
  })

  it('keeps the bound confirmation for retry after a failed restore', async () => {
    restoreSnapshot.mockRejectedValueOnce(new Error('disk full'))

    const { result } = withSetup()
    await flush()

    result.requestRestore()
    await result.confirmRestore()

    expect(result.confirmation.value?.snapshotId).toBe('snap-new')
    expect(result.restoreError.value).toBeTruthy()

    restoreSnapshot.mockResolvedValueOnce(restoreResult())
    await result.confirmRestore()

    expect(restoreSnapshot).toHaveBeenLastCalledWith('note-1', 'snap-new')
    expect(result.confirmation.value).toBeNull()
    expect(result.restoreError.value).toBeNull()
  })

  it('rolls back the created note when saving the copy fails', async () => {
    backend.saveNote.mockRejectedValueOnce(new Error('disk full'))

    const { result } = withSetup()
    await flush()

    const returned = await result.copySelectedSnapshot()

    expect(returned).toBeNull()
    expect(deleteNote).toHaveBeenCalledWith('note-copy')
    expect(permanentlyDeleteFromTrash).toHaveBeenCalledWith('note-copy')
  })

  it('creates the workspace gate before copying a notebook snapshot and preserves vendor fields', async () => {
    const source = createNote('note-1', '', {
      documentKind: 'notebook',
      content: { type: 'doc', content: [{ type: 'paragraph' }] },
      notebook: createNotebook('grid'),
      vendorNoteField: { keep: true },
    })
    backend.loadNoteSnapshot.mockResolvedValueOnce(source)
    const { result } = withSetup()
    await flush()

    const returned = await result.copySelectedSnapshot()

    expect(returned).toBe('note-copy')
    expect(createTreeNotebook).toHaveBeenCalledWith('folder-1', expect.any(String), '1', 'grid')
    expect(createTreeNote).not.toHaveBeenCalled()
    expect(createTreeNotebook.mock.invocationCallOrder[0]).toBeLessThan(backend.saveNote.mock.invocationCallOrder[0]!)
    expect(backend.saveNote).toHaveBeenCalledWith(expect.objectContaining({
      id: 'note-copy', documentKind: 'notebook', notebook: source.notebook, vendorNoteField: { keep: true },
    }))
  })

  it('reports the orphan note id when rollback fails', async () => {
    backend.saveNote.mockRejectedValueOnce(new Error('disk full'))
    deleteNote.mockRejectedValueOnce(new Error('locked'))

    const { result } = withSetup()
    await flush()

    await result.copySelectedSnapshot()

    expect(result.copyError.value).toContain('note-copy')
  })

  it('retry reloads a failed timeline and a failed snapshot', async () => {
    backend.listNoteSnapshots.mockRejectedValueOnce(new Error('offline'))
    backend.loadNoteSnapshot.mockRejectedValueOnce(new Error('offline'))

    const { result } = withSetup()
    await flush()

    expect(result.snapshotsError.value).toBeTruthy()

    backend.listNoteSnapshots.mockImplementation(async () => createSnapshots())
    await result.retrySnapshots()
    expect(result.snapshotsError.value).toBeNull()
    expect(backend.listNoteSnapshots).toHaveBeenCalledTimes(2)

    await flush()
    backend.loadNoteSnapshot.mockRejectedValueOnce(new Error('offline'))
    await result.retrySnapshot()
    expect(result.snapshotError.value).toBeTruthy()

    backend.loadNoteSnapshot.mockImplementation(async (_noteId: string, snapshotId: string) =>
      createNote('note-1', snapshotId === 'snap-new' ? 'Newer snapshot body' : 'Older snapshot body'))
    await result.retrySnapshot()
    expect(result.snapshotError.value).toBeNull()
  })

  it('disables actions after a failed timeline reload and restores them after retry', async () => {
    const { result, wrapper } = withSetup()
    await flush()
    expect(result.selectedSnapshotLoaded.value).toBe(true)

    backend.listNoteSnapshots.mockRejectedValueOnce(new Error('offline'))
    await result.retrySnapshots()

    expect(result.selectedSnapshotId.value).toBeNull()
    expect(result.selectedSnapshot.value).toBeNull()
    expect(result.selectedSnapshotLoaded.value).toBe(false)
    result.requestRestore()
    expect(result.confirmation.value).toBeNull()
    expect(await result.copySelectedSnapshot()).toBeNull()
    expect(createTreeNote).not.toHaveBeenCalled()

    backend.listNoteSnapshots.mockImplementationOnce(async () => createSnapshots())
    await result.retrySnapshots()
    await flush()
    expect(result.selectedSnapshotLoaded.value).toBe(true)
    result.requestRestore()
    expect(result.confirmation.value).toEqual({
      snapshotId: 'snap-new',
      createdAt: '2026-05-14T12:00:00.000Z',
    })
    wrapper.unmount()
  })
})
