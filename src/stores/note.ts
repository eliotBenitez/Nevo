import { defineStore } from 'pinia'
import { markRaw, ref } from 'vue'
import type { NoteDocument, NoteProperties, NoteSnapshotMeta, RestoreNoteSnapshotResult } from '../types/note'
import type { CanvasSnapshotV1 } from '../core/canvas'
import { decodeNotebook, decodeNoteFormat, type NoteFormatResult, type NotebookSnapshotV1 } from '../core/notebook'
import { appLogger } from '../utils/logger'
import { useTreeStore } from './tree'
import { useWorkspaceStore } from './workspace'
import { workspaceHandleKey } from '../core/workspace-backend'
import { createNoteCache } from '../core/document-session/noteCache'
import { createSaveQueue } from '../core/document-session/saveQueue'
import { getEditorSession, suspendEditorPersistence } from '../core/document-session/editorSessionRegistry'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

// Shared across every store instance in the process (module scope), unlike
// the per-instance state inside `defineStore` below: a cache of recently
// opened notes is meant to survive across, say, closing and reopening the
// history modal, not just across mutations within one active session.
const noteCache = createNoteCache()

const EMPTY_PROPERTIES: NoteProperties = {
  type: null,
  tags: [],
  date: null,
  status: null,
}

type NotePropertiesPatch = Partial<NoteProperties>

/**
 * Keeps the note body out of Vue's deep reactivity.
 *
 * `content` is a large plain-JSON tree (a ~230k-character note is several
 * thousand nodes) that is only ever replaced wholesale through `setContent` —
 * never mutated through the store proxy — so per-node reactivity buys nothing
 * and costs a lot: every consumer that walks the document (right-panel outline
 * and word count, editor init via `nodeFromJSON`, serialization) pays proxy
 * creation plus dependency tracking for every node. Measured on WebKitGTK with
 * a 230k-character note, the right panel's three document walks take ~37 ms
 * through proxies versus ~6 ms on the raw tree.
 *
 * `markRaw` returns the same object, so content identity — which `isSameDraft`
 * and the editor's reload check rely on — is preserved.
 */
function keepContentRaw<T extends NoteDocument>(note: T): T {
  if (note.content && typeof note.content === 'object') markRaw(note.content)
  if (note.notebook && typeof note.notebook === 'object') markRaw(note.notebook)
  return note
}

function normalizeTagList(tags: readonly string[] | undefined): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const tag of tags ?? []) {
    const trimmed = tag.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    normalized.push(trimmed)
  }
  return normalized
}

function normalizeNullableString<T extends string>(value: T | null | undefined): T | null {
  return value && value.trim() ? value : null
}

function normalizeProperties(properties: NoteProperties | undefined): NoteProperties {
  return {
    ...properties,
    type: normalizeNullableString(properties?.type),
    tags: normalizeTagList(properties?.tags),
    date: normalizeNullableString(properties?.date),
    status: normalizeNullableString(properties?.status),
  }
}

function arePropertiesEqual(a: NoteProperties | undefined, b: NoteProperties | undefined): boolean {
  const left = normalizeProperties(a)
  const right = normalizeProperties(b)
  return (
    left.type === right.type
    && left.date === right.date
    && left.status === right.status
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index])
  )
}

export const useNoteStore = defineStore('note', () => {
  const activeNote = ref<NoteDocument | null>(null)
  const snapshots = ref<NoteSnapshotMeta[]>([])
  const isDirty = ref(false)
  const saveStatus = ref<SaveStatus>('saved')
  // Only a real commit stamps this. `saveStatus` also lands on 'saved' when a note is
  // merely opened or restored from cache, and showing a save time then would be a lie.
  const lastSavedAt = ref<string | null>(null)
  // Bumped on every dirty-marking mutation, including ones where `isDirty` was
  // already true (e.g. typing while a save is in flight). `isDirty` alone can't
  // signal those because it only transitions false -> true once; consumers that
  // need to react to "content changed again" (autosave scheduling) should watch
  // this instead. It doubles as the save queue's per-write ordering token —
  // see `persistActiveNote`.
  const dirtyRevision = ref(0)
  let activeFormat: { note: NoteDocument; result: NoteFormatResult } | null = null
  let noteSessionToken = 0
  // Serializes `backend.saveNote()` calls per note id. Autosave, blur,
  // navigation, unmount, and app-close can all decide to save around the
  // same time; without a single-writer queue, two overlapping saves race the
  // backend and whichever happens to *resolve* last wins — not necessarily
  // the one holding the newest content. This queue makes that structurally
  // impossible within this process. It says nothing about a second process
  // or device writing the same note.json concurrently — there is no on-disk
  // revision/optimistic-concurrency field to detect that, and adding one is
  // out of scope here.
  const saveQueue = createSaveQueue()

  function resetNoteState() {
    activeNote.value = null
    activeFormat = null
    snapshots.value = []
    isDirty.value = false
    saveStatus.value = 'saved'
    lastSavedAt.value = null
  }

  function formatFor(note: NoteDocument): NoteFormatResult {
    if (activeFormat?.note === note) return activeFormat.result
    const result = decodeNoteFormat(note)
    activeFormat = { note, result }
    return result
  }

  function rebindActiveFormat(note: NoteDocument): void {
    if (activeFormat && activeFormat.note.id === note.id) activeFormat.note = note
  }

  function getActiveNoteFormat(noteId?: string): NoteFormatResult | null {
    const note = activeNote.value
    if (!note || (noteId !== undefined && note.id !== noteId)) return null
    return formatFor(note)
  }

  function isSameDraft(a: NoteDocument, b: NoteDocument) {
    return (
      a.id === b.id
      && a.title === b.title
      && a.icon === b.icon
      && a.cover === b.cover
      && a.folderId === b.folderId
      && arePropertiesEqual(a.properties, b.properties)
      && a.canvas === b.canvas
      && a.documentKind === b.documentKind
      && a.notebook === b.notebook
      // Content identity is preserved across setContent (mutates in place) and
      // saveNote (spreads meta only), so a reference check is sufficient and
      // avoids O(document) JSON.stringify on large notes.
      && a.content === b.content
    )
  }

  async function loadNote(noteId: string, options: { force?: boolean } = {}) {
    const workspaceStore = useWorkspaceStore()
    const backend = workspaceStore.backend
    if (!backend) return
    const handleKey = workspaceHandleKey(backend.handle)
    // Drops any note cached under a different workspace handle — otherwise a
    // note id that also exists in a previously open (or cloned) workspace
    // could be served here, and later saved, as if it belonged to this one.
    noteCache.clearExcept(handleKey)
    const sessionToken = ++noteSessionToken
    resetNoteState()

    const cachedNote = noteCache.get(handleKey, noteId)
    if (cachedNote && !options.force) {
      noteCache.set(handleKey, cachedNote)
      if (sessionToken !== noteSessionToken || workspaceStore.backend !== backend) return
      activeNote.value = keepContentRaw(cachedNote)
      formatFor(activeNote.value)
      isDirty.value = false
      saveStatus.value = 'saved'
      lastSavedAt.value = null
      return
    }

    let note: NoteDocument
    try {
      note = await backend.loadNote(noteId)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.note',
        event: 'load_note',
        message: 'Failed to load note',
        workspacePath: workspaceStore.activePath ?? undefined,
        error,
        payload: { noteId },
      })
      throw error
    }

    if (sessionToken !== noteSessionToken || workspaceStore.backend !== backend) return

    activeNote.value = keepContentRaw(note)
    formatFor(activeNote.value)
    isDirty.value = false
    saveStatus.value = 'saved'
    lastSavedAt.value = null
    noteCache.set(handleKey, note)
  }

  /**
   * Populates `snapshots` for `noteId` on demand. Split out of `loadNote` so
   * opening a note never pays the snapshot-listing cost — history is a rarely
   * opened panel (see F11). Callers that show per-note history should call
   * this when their panel/modal opens rather than relying on `loadNote`.
   */
  async function loadSnapshots(noteId: string) {
    const workspaceStore = useWorkspaceStore()
    const backend = workspaceStore.backend
    if (!backend) return
    const sessionToken = noteSessionToken
    try {
      const nextSnapshots = await backend.listNoteSnapshots(noteId)
      if (sessionToken !== noteSessionToken || workspaceStore.backend !== backend) return
      if (activeNote.value?.id !== noteId) return
      snapshots.value = nextSnapshots
    } catch (error) {
      await appLogger.error({
        source: 'frontend.note',
        event: 'load_snapshots',
        message: 'Failed to load note snapshots',
        workspacePath: workspaceStore.activePath ?? undefined,
        error,
        payload: { noteId },
      })
      throw error
    }
  }

  async function prewarmCache(noteId: string) {
    const workspaceStore = useWorkspaceStore()
    const backend = workspaceStore.backend
    if (!backend) return
    const handleKey = workspaceHandleKey(backend.handle)
    noteCache.clearExcept(handleKey)
    if (noteCache.get(handleKey, noteId)) return
    try {
      const note = await backend.loadNote(noteId)
      if (workspaceStore.backend !== backend) return
      noteCache.set(handleKey, keepContentRaw(note))
    } catch (error) {
      await appLogger.error({
        source: 'frontend.note',
        event: 'prewarm_note_cache',
        message: 'Failed to prewarm note cache',
        workspacePath: workspaceStore.activePath ?? undefined,
        error,
        payload: { noteId },
      })
    }
  }

  function invalidateNoteCache(noteId: string) {
    const backend = useWorkspaceStore().backend
    if (!backend) return
    noteCache.delete(workspaceHandleKey(backend.handle), noteId)
  }

  /**
   * Flushes the pending editor content update and, if the note is dirty, saves
   * it through the backend. Throws on failure instead of catching — `saveNote`
   * and `flushDurably` each decide separately what to do with that.
   *
   * The actual `backend.saveNote()` call is routed through `saveQueue`, keyed
   * by note id and ordered by `dirtyRevision` at the moment this call started
   * flushing: `isDirty`/`saveStatus` only settle to clean once a commit
   * covering *at least* that revision has completed. If more edits land while
   * this call is queued or in flight, `dirtyRevision` will have moved past
   * what we captured by the time we check — so the note is correctly left
   * dirty for the next save to pick up, no matter which of several
   * overlapping `persistActiveNote()` calls happens to be the one whose
   * commit actually runs (the queue coalesces the rest).
   */
  async function persistActiveNote(options: { flushEditorSession?: boolean } = {}): Promise<void> {
    const workspaceStore = useWorkspaceStore()
    const backend = workspaceStore.backend
    const activeNoteId = activeNote.value?.id ?? null
    const session = activeNoteId ? getEditorSession(activeNoteId) : undefined
    const current = activeNote.value
    if (current && !formatFor(current).editable) return
    const flushResult = backend && current && options.flushEditorSession !== false ? session?.flushContent() : undefined
    if (flushResult instanceof Promise) await flushResult

    const currentNote = activeNote.value
    if (!backend || !currentNote || !isDirty.value) return

    const noteId = currentNote.id
    const revision = dirtyRevision.value
    const sessionToken = noteSessionToken
    const handleKey = workspaceHandleKey(backend.handle)
    saveStatus.value = 'saving'

    await saveQueue.enqueue(noteId, revision, async (committedRevision) => {
      // Re-check staleness here too: this closure may run later than it was
      // created, if an earlier commit for the same note was still in flight
      // when this one was queued (or it may not run at all, if a still-newer
      // request supersedes it — see saveQueue's coalescing).
      const noteToSave = activeNote.value
      if (!noteToSave || noteToSave.id !== noteId || sessionToken !== noteSessionToken || workspaceStore.backend !== backend) {
        return
      }
      const note = { ...noteToSave, updatedAt: new Date().toISOString() }
      await backend.saveNote(note)

      if (sessionToken !== noteSessionToken || workspaceStore.backend !== backend || activeNote.value?.id !== note.id) {
        return
      }

      if (committedRevision >= dirtyRevision.value && isSameDraft(activeNote.value, note)) {
        activeNote.value = keepContentRaw(note)
        rebindActiveFormat(activeNote.value)
        isDirty.value = false
        saveStatus.value = 'saved'
        lastSavedAt.value = note.updatedAt
        noteCache.set(handleKey, note)
        useTreeStore().syncNoteMeta(note.id, { title: note.title, icon: note.icon }, note.updatedAt)
        void workspaceStore.refreshSidebarNotePreviews()
      } else {
        isDirty.value = true
        saveStatus.value = 'unsaved'
      }
    })
  }

  async function saveNote() {
    const workspaceStore = useWorkspaceStore()
    const currentNote = activeNote.value
    const sessionToken = noteSessionToken
    try {
      await persistActiveNote()
    } catch (error) {
      await appLogger.error({
        source: 'frontend.note',
        event: 'save_note',
        message: 'Failed to save note',
        workspacePath: workspaceStore.activePath ?? undefined,
        error,
        payload: { noteId: currentNote?.id },
      })
      if (sessionToken !== noteSessionToken || activeNote.value?.id !== currentNote?.id) return
      saveStatus.value = 'error'
    }
  }

  /**
   * Like `saveNote`, but also waits for the backend to confirm the write is
   * durable (see `WorkspaceBackend.flushDurability`) — used where losing the
   * last edits would be worse than a slower operation, e.g. before the app
   * window is allowed to close. Never throws; failure is reported in the
   * return value so the caller can decide what to do (retry, warn the user).
   *
   * `persistActiveNote()` already awaits `saveQueue` for the active note: the
   * queue only clears `isDirty` from inside the commit that actually persists
   * it, so while any save for this note is genuinely in flight, `isDirty`
   * stays `true` and `persistActiveNote()` cannot return early without
   * enqueuing (and awaiting) a request that the queue will coalesce with it.
   * There is no separate in-flight write this call could miss.
   */
  async function flushDurably(
    options: { flushEditorSession?: boolean } = {},
  ): Promise<{ ok: true } | { ok: false; error: unknown }> {
    const workspaceStore = useWorkspaceStore()
    const currentNote = activeNote.value
    const backendAtStart = workspaceStore.backend
    const sessionToken = noteSessionToken
    try {
      await persistActiveNote(options)
      const backend = workspaceStore.backend
      if (backend !== backendAtStart || noteSessionToken !== sessionToken || activeNote.value?.id !== currentNote?.id) {
        return { ok: false, error: new Error('Active note changed during durable flush') }
      }
      if (!backend) return { ok: true }
      await backend.flushDurability()
      if (workspaceStore.backend !== backendAtStart || noteSessionToken !== sessionToken || activeNote.value?.id !== currentNote?.id) {
        return { ok: false, error: new Error('Active note changed during durable flush') }
      }
      if (isDirty.value || saveStatus.value === 'error') {
        return { ok: false, error: new Error('The latest note revision is not durable') }
      }
      return { ok: true }
    } catch (error) {
      if (sessionToken === noteSessionToken && activeNote.value?.id === currentNote?.id) {
        saveStatus.value = 'error'
      }
      await appLogger.error({
        source: 'frontend.note',
        event: 'flush_durably',
        message: 'Failed to flush note durably',
        workspacePath: workspaceStore.activePath ?? undefined,
        error,
        payload: { noteId: currentNote?.id },
      })
      return { ok: false, error }
    }
  }

  function setContent(content: NoteDocument['content']) {
    const note = activeNote.value
    if (!note || formatFor(note).status !== 'document') return
    // Mutate content in place instead of spreading a new note object: this
    // preserves content identity (so isSameDraft/saveNote stay O(1)) and
    // avoids invalidating every watcher keyed on `activeNote.value` identity
    // (e.g. WorkspaceShell, WorkspaceEditorPane props.note) on each debounced
    // flush during typing on large documents.
    note.content = content && typeof content === 'object' ? markRaw(content) : content
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function setCanvas(canvas: CanvasSnapshotV1) {
    const note = activeNote.value
    if (!note || formatFor(note).status !== 'document' || note.canvas === canvas) return
    note.canvas = canvas
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function markContentDirty() {
    if (!activeNote.value || formatFor(activeNote.value).status !== 'document') return
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function setTitle(title: string) {
    if (!activeNote.value || !formatFor(activeNote.value).editable) return
    activeNote.value = { ...activeNote.value, title }
    rebindActiveFormat(activeNote.value)
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function setIcon(icon: string) {
    if (!activeNote.value || !formatFor(activeNote.value).editable) return
    activeNote.value = { ...activeNote.value, icon }
    rebindActiveFormat(activeNote.value)
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function setCover(cover: string | null) {
    if (!activeNote.value || !formatFor(activeNote.value).editable) return
    activeNote.value = { ...activeNote.value, cover: cover ?? undefined }
    rebindActiveFormat(activeNote.value)
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function setPropertiesPatch(patch: NotePropertiesPatch) {
    if (!activeNote.value || !formatFor(activeNote.value).editable) return
    const current = normalizeProperties(activeNote.value.properties)
    const next = normalizeProperties({ ...current, ...patch })
    activeNote.value = {
      ...activeNote.value,
      properties: {
        ...EMPTY_PROPERTIES,
        ...next,
      },
    }
    rebindActiveFormat(activeNote.value)
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function setNotebook(snapshot: NotebookSnapshotV1, noteId?: string): boolean {
    const note = activeNote.value
    if (!note || (noteId !== undefined && note.id !== noteId)) return false
    if (formatFor(note).status !== 'notebook') return false
    const decoded = decodeNotebook(snapshot)
    if (decoded.status !== 'valid') return false
    return setNotebookFromSession(decoded.snapshot, note.id)
  }

  function setNotebookFromSession(snapshot: NotebookSnapshotV1, noteId: string): boolean {
    const note = activeNote.value
    if (!note || note.id !== noteId || formatFor(note).status !== 'notebook') return false
    if (note.notebook === snapshot) return true
    note.notebook = markRaw(snapshot)
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
    return true
  }

  function clearNote() {
    noteSessionToken += 1
    resetNoteState()
  }

  /**
   * Restores a note to a prior snapshot as one atomic backend operation
   * (note.json + the manifest entry — see `WorkspaceBackend.restoreNoteSnapshot`).
   * Throws on failure instead of swallowing it: a restore that silently did
   * nothing is worse than one that visibly failed.
   *
   * `noteId` need not be the active note — history can restore any note in
   * the workspace. When it *is* active:
   *
   * 1. `persistActiveNote()` flushes the editor session's pending content and,
   *    if dirty, saves it through the (single-writer) save queue — awaiting
   *    this also waits out an autosave that was already in flight, so a
   *    concurrent write can never race the restore. If this save fails, the
   *    restore never runs and the note.json on disk is left untouched.
   * 2. Disk persistence is suspended so nothing else can write `note.json`
   *    out from under the restore.
   * 3. The backend performs the restore.
   * 4. `finally`, the note is force-reloaded from disk, bumping
   *    `noteSessionToken` — any save closure still queued from before the
   *    restore, or a later autosave tick scheduled against the pre-restore
   *    session, becomes a no-op (its captured session token no longer
   *    matches, and `isDirty` is false on the freshly loaded note) instead of
   *    overwriting the restored content.
   */
  async function restoreSnapshot(noteId: string, snapshotId: string): Promise<RestoreNoteSnapshotResult> {
    const workspaceStore = useWorkspaceStore()
    const backend = workspaceStore.backend
    if (!backend) throw new Error('No active workspace backend')

    const sessionToken = noteSessionToken
    const isActive = activeNote.value?.id === noteId

    if (isActive) {
      try {
        await persistActiveNote()
      } catch (error) {
        saveStatus.value = 'error'
        await appLogger.error({
          source: 'frontend.note',
          event: 'restore_snapshot_presave',
          message: 'Failed to save pending edits before restoring a note snapshot',
          workspacePath: workspaceStore.activePath ?? undefined,
          error,
          payload: { noteId, snapshotId },
        })
        throw error
      }
    }

    try {
      if (isActive) suspendEditorPersistence(noteId)

      const result = await backend.restoreNoteSnapshot(noteId, snapshotId)
      invalidateNoteCache(noteId)
      useTreeStore().syncNoteMeta(result.note.id, { title: result.note.title, icon: result.note.icon }, result.note.updatedAt)
      void workspaceStore.refreshSidebarNotePreviews()
      return result
    } catch (error) {
      await appLogger.error({
        source: 'frontend.note',
        event: 'restore_snapshot',
        message: 'Failed to restore note snapshot',
        workspacePath: workspaceStore.activePath ?? undefined,
        error,
        payload: { noteId, snapshotId },
      })
      throw error
    } finally {
      if (isActive && sessionToken === noteSessionToken && workspaceStore.backend === backend) {
        await loadNote(noteId, { force: true })
      }
    }
  }

  return {
    activeNote,
    getActiveNoteFormat,
    snapshots,
    isDirty,
    dirtyRevision,
    saveStatus,
    lastSavedAt,
    loadNote,
    loadSnapshots,
    saveNote,
    flushDurably,
    prewarmCache,
    invalidateNoteCache,
    setContent,
    setCanvas,
    setNotebook,
    setNotebookFromSession,
    markContentDirty,
    setTitle,
    setIcon,
    setCover,
    setPropertiesPatch,
    clearNote,
    restoreSnapshot,
  }
})
