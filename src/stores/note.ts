import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { NoteDocument, NoteSnapshotMeta } from '../types/note'
import { appLogger } from '../utils/logger'
import { useWorkspaceStore } from './workspace'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

const NOTE_CACHE_LIMIT = 5
const noteCache = new Map<string, NoteDocument>()

function pushToCache(note: NoteDocument) {
  noteCache.delete(note.id)
  noteCache.set(note.id, note)
  while (noteCache.size > NOTE_CACHE_LIMIT) {
    const oldestKey = noteCache.keys().next().value
    if (oldestKey === undefined) break
    noteCache.delete(oldestKey)
  }
}

export const useNoteStore = defineStore('note', () => {
  const activeNote = ref<NoteDocument | null>(null)
  const snapshots = ref<NoteSnapshotMeta[]>([])
  const isDirty = ref(false)
  const saveStatus = ref<SaveStatus>('saved')
  let noteSessionToken = 0
  let pendingContentFlush: (() => void | Promise<void>) | null = null

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
      && JSON.stringify(a.content) === JSON.stringify(b.content)
    )
  }

  async function loadNote(noteId: string) {
    const workspaceStore = useWorkspaceStore()
    const backend = workspaceStore.backend
    if (!backend) return
    const sessionToken = ++noteSessionToken
    resetNoteState()

    const cachedNote = noteCache.get(noteId)
    if (cachedNote) {
      noteCache.delete(noteId)
      noteCache.set(noteId, cachedNote)
      if (sessionToken !== noteSessionToken || workspaceStore.backend !== backend) return
      activeNote.value = cachedNote
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

    activeNote.value = note
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
      pushToCache(note)
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

  async function saveNote() {
    const workspaceStore = useWorkspaceStore()
    const backend = workspaceStore.backend
    const flushResult = backend ? pendingContentFlush?.() : undefined
    if (flushResult instanceof Promise) await flushResult
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
        saveStatus.value = 'unsaved'
        return
      }

      activeNote.value = note
      isDirty.value = false
      saveStatus.value = 'saved'
      pushToCache(note)
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
    if (!activeNote.value) return
    activeNote.value = { ...activeNote.value, content }
    isDirty.value = true
    saveStatus.value = 'unsaved'
  }

  function markContentDirty() {
    if (!activeNote.value) return
    isDirty.value = true
    saveStatus.value = 'unsaved'
  }

  function setTitle(title: string) {
    if (!activeNote.value) return
    activeNote.value = { ...activeNote.value, title }
    isDirty.value = true
    saveStatus.value = 'unsaved'
  }

  function setIcon(icon: string) {
    if (!activeNote.value) return
    activeNote.value = { ...activeNote.value, icon }
    isDirty.value = true
    saveStatus.value = 'unsaved'
  }

  function setCover(cover: string | null) {
    if (!activeNote.value) return
    activeNote.value = { ...activeNote.value, cover: cover ?? undefined }
    isDirty.value = true
    saveStatus.value = 'unsaved'
  }

  function clearNote() {
    noteSessionToken += 1
    resetNoteState()
  }

  function setPendingContentFlush(flush: (() => void | Promise<void>) | null) {
    pendingContentFlush = flush
  }

  async function restoreSnapshot(snapshotId: string) {
    const workspaceStore = useWorkspaceStore()
    const backend = workspaceStore.backend
    const note = activeNote.value
    if (!backend || !note) return

    const sessionToken = noteSessionToken
    saveStatus.value = 'saving'
    try {
      const restored = await backend.restoreNoteSnapshot(note.id, snapshotId)
      const nextSnapshots = await backend.listNoteSnapshots(note.id)
      if (sessionToken !== noteSessionToken || workspaceStore.backend !== backend || activeNote.value?.id !== note.id) {
        return
      }
      activeNote.value = restored
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
    saveStatus,
    loadNote,
    saveNote,
    prewarmCache,
    setContent,
    markContentDirty,
    setTitle,
    setIcon,
    setCover,
    clearNote,
    setPendingContentFlush,
    restoreSnapshot,
  }
})
