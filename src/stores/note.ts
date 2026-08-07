import { defineStore } from 'pinia'
import { markRaw, ref } from 'vue'
import type { NoteDocument, NoteProperties, NoteSnapshotMeta } from '../types/note'
import type { CanvasSnapshotV1 } from '../core/canvas'
import { appLogger } from '../utils/logger'
import { useTreeStore } from './tree'
import { useWorkspaceStore } from './workspace'
import { createYDocFromContent, encodeYDocState } from '../editor-core/collaboration'
import { nevoBaseSchema } from '../editor-core/schema'
import { replaceCanvasSnapshot } from '../core/canvas'
import { collabCommands } from '../tauri/commands'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

const NOTE_CACHE_LIMIT = 5
const noteCache = new Map<string, NoteDocument>()
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
  return note
}

function pushToCache(note: NoteDocument) {
  noteCache.delete(note.id)
  noteCache.set(note.id, note)
  while (noteCache.size > NOTE_CACHE_LIMIT) {
    const oldestKey = noteCache.keys().next().value
    if (oldestKey === undefined) break
    noteCache.delete(oldestKey)
  }
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
  // Bumped on every dirty-marking mutation, including ones where `isDirty` was
  // already true (e.g. typing while a save is in flight). `isDirty` alone can't
  // signal those because it only transitions false -> true once; consumers that
  // need to react to "content changed again" (autosave scheduling) should watch
  // this instead.
  const dirtyRevision = ref(0)
  let noteSessionToken = 0
  let pendingContentFlush: (() => void | Promise<void>) | null = null
  // Persists the editor-owned (disk-backed) Y.Doc immediately. The Y.Doc is the
  // authoritative content on reload, but it saves on its own 2 s debounce, so a
  // plain `saveNote` (which only writes note.json) could leave the last edits
  // unpersisted in the .yjs file on quit. Flushing it here ties the two writers
  // to the same save points (autosave, navigation, app close).
  let pendingYjsFlush: (() => void | Promise<void>) | null = null

  function resetNoteState() {
    activeNote.value = null
    snapshots.value = []
    isDirty.value = false
    saveStatus.value = 'saved'
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
    const sessionToken = ++noteSessionToken
    resetNoteState()

    const cachedNote = noteCache.get(noteId)
    if (cachedNote && !options.force) {
      noteCache.delete(noteId)
      noteCache.set(noteId, cachedNote)
      if (sessionToken !== noteSessionToken || workspaceStore.backend !== backend) return
      activeNote.value = keepContentRaw(cachedNote)
      isDirty.value = false
      saveStatus.value = 'saved'
      return
    }

    let note: NoteDocument
    let nextSnapshots: NoteSnapshotMeta[]
    try {
      [note, nextSnapshots] = await Promise.all([
        backend.loadNote(noteId),
        backend.listNoteSnapshots(noteId),
      ])
    } catch (error) {
      await appLogger.error({
        source: 'frontend.note',
        event: 'load_note',
        message: 'Failed to load note or snapshots',
        workspacePath: workspaceStore.activePath ?? undefined,
        error,
        payload: { noteId },
      })
      throw error
    }

    if (sessionToken !== noteSessionToken || workspaceStore.backend !== backend) return

    activeNote.value = keepContentRaw(note)
    snapshots.value = nextSnapshots
    isDirty.value = false
    saveStatus.value = 'saved'
    pushToCache(note)
  }

  async function prewarmCache(noteId: string) {
    if (noteCache.has(noteId)) return
    const workspaceStore = useWorkspaceStore()
    const backend = workspaceStore.backend
    if (!backend) return
    try {
      const note = await backend.loadNote(noteId)
      if (workspaceStore.backend !== backend) return
      pushToCache(keepContentRaw(note))
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
    noteCache.delete(noteId)
  }

  async function saveNote() {
    const workspaceStore = useWorkspaceStore()
    const backend = workspaceStore.backend
    const flushResult = backend ? pendingContentFlush?.() : undefined
    if (flushResult instanceof Promise) await flushResult
    // Runs before the dirty check below so the authoritative Y.Doc is persisted
    // on every save trigger — including navigation/close flushes where the note
    // store may already be clean but the Y.Doc debounce is still pending.
    const yjsFlushResult = backend ? pendingYjsFlush?.() : undefined
    if (yjsFlushResult instanceof Promise) await yjsFlushResult
    const currentNote = activeNote.value
    if (!backend || !currentNote || !isDirty.value) return
    const sessionToken = noteSessionToken
    saveStatus.value = 'saving'
    try {
      const note = {
        ...currentNote,
        updatedAt: new Date().toISOString(),
      }
      await backend.saveNote(note)

      if (sessionToken !== noteSessionToken || workspaceStore.backend !== backend || activeNote.value?.id !== note.id) {
        return
      }

      if (!activeNote.value || !isSameDraft(activeNote.value, note)) {
        isDirty.value = true
        dirtyRevision.value += 1
        saveStatus.value = 'unsaved'
        return
      }

      activeNote.value = keepContentRaw(note)
      isDirty.value = false
      saveStatus.value = 'saved'
      pushToCache(note)
      useTreeStore().syncNoteMeta(note.id, { title: note.title, icon: note.icon }, note.updatedAt)
      void workspaceStore.refreshSidebarNotePreviews()
    } catch (error) {
      await appLogger.error({
        source: 'frontend.note',
        event: 'save_note',
        message: 'Failed to save note',
        workspacePath: workspaceStore.activePath ?? undefined,
        error,
        payload: { noteId: currentNote.id },
      })
      if (sessionToken !== noteSessionToken || activeNote.value?.id !== currentNote.id) return
      saveStatus.value = 'error'
    }
  }

  function setContent(content: NoteDocument['content']) {
    const note = activeNote.value
    if (!note) return
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
    if (!note || note.canvas === canvas) return
    note.canvas = canvas
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function markContentDirty() {
    if (!activeNote.value) return
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function setTitle(title: string) {
    if (!activeNote.value) return
    activeNote.value = { ...activeNote.value, title }
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function setIcon(icon: string) {
    if (!activeNote.value) return
    activeNote.value = { ...activeNote.value, icon }
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function setCover(cover: string | null) {
    if (!activeNote.value) return
    activeNote.value = { ...activeNote.value, cover: cover ?? undefined }
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function setPropertiesPatch(patch: NotePropertiesPatch) {
    if (!activeNote.value) return
    const current = normalizeProperties(activeNote.value.properties)
    const next = normalizeProperties({ ...current, ...patch })
    activeNote.value = {
      ...activeNote.value,
      properties: {
        ...EMPTY_PROPERTIES,
        ...next,
      },
    }
    isDirty.value = true
    dirtyRevision.value += 1
    saveStatus.value = 'unsaved'
  }

  function clearNote() {
    noteSessionToken += 1
    resetNoteState()
  }

  function setPendingContentFlush(flush: (() => void | Promise<void>) | null) {
    pendingContentFlush = flush
  }

  function setPendingYjsFlush(flush: (() => void | Promise<void>) | null) {
    pendingYjsFlush = flush
  }

  async function restoreSnapshot(snapshotId: string) {
    const workspaceStore = useWorkspaceStore()
    const backend = workspaceStore.backend
    const note = activeNote.value
    if (!backend || !note) return

    const sessionToken = noteSessionToken
    saveStatus.value = 'saving'
    try {
      const contentFlush = pendingContentFlush?.()
      if (contentFlush instanceof Promise) await contentFlush
      const yjsFlush = pendingYjsFlush?.()
      if (yjsFlush instanceof Promise) await yjsFlush
      const restored = await backend.restoreNoteSnapshot(note.id, snapshotId)
      if (workspaceStore.backendKind === 'local' && workspaceStore.activePath) {
        const restoredYDoc = createYDocFromContent(nevoBaseSchema, restored.content)
        if (restored.canvas) replaceCanvasSnapshot(restoredYDoc, restored.canvas)
        await collabCommands.saveYjsState(
          workspaceStore.activePath,
          restored.id,
          encodeYDocState(restoredYDoc),
        )
        restoredYDoc.destroy()
      }
      const nextSnapshots = await backend.listNoteSnapshots(note.id)
      if (sessionToken !== noteSessionToken || workspaceStore.backend !== backend || activeNote.value?.id !== note.id) {
        return
      }
      activeNote.value = keepContentRaw(restored)
      snapshots.value = nextSnapshots
      isDirty.value = false
      saveStatus.value = 'saved'
      pushToCache(restored)
    } catch (error) {
      await appLogger.error({
        source: 'frontend.note',
        event: 'restore_snapshot',
        message: 'Failed to restore note snapshot',
        workspacePath: workspaceStore.activePath ?? undefined,
        error,
        payload: { noteId: note.id, snapshotId },
      })
      if (sessionToken !== noteSessionToken || activeNote.value?.id !== note.id) return
      saveStatus.value = 'error'
    }
  }

  return {
    activeNote,
    snapshots,
    isDirty,
    dirtyRevision,
    saveStatus,
    loadNote,
    saveNote,
    prewarmCache,
    invalidateNoteCache,
    setContent,
    setCanvas,
    markContentDirty,
    setTitle,
    setIcon,
    setCover,
    setPropertiesPatch,
    clearNote,
    setPendingContentFlush,
    setPendingYjsFlush,
    restoreSnapshot,
  }
})
