import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { useNoteStore } from '../../../stores/note'
import { useTabsStore } from '../../../stores/tabs'
import { useTreeStore } from '../../../stores/tree'
import { finalizeActiveRecording } from '../../../core/voice-recording/activeRecording'
import type { NotebookSnapshotV1 } from '../../../core/notebook/types'
import type { NoteDocument } from '../../../types/note'
import type { WorkspaceRouteState } from './useWorkspaceRouteState'

export interface UseWorkspaceNoteSessionOptions {
  router: Router
  route: RouteLocationNormalizedLoaded
  routeState: WorkspaceRouteState
  flushSave: () => Promise<void> | void
  routeForNote: (noteId: string) => string
  reportHistorySaveFailure: () => void
}

// Binds the route's note to the note store: loads it on navigation (flushing the
// note being left), keeps its tab in sync, and forwards editor updates to the store.
export function useWorkspaceNoteSession(options: UseWorkspaceNoteSessionOptions) {
  const { router, route, routeState, flushSave, routeForNote, reportHistorySaveFailure } = options
  const { activeNoteId } = routeState
  const { t } = useI18n()
  const noteStore = useNoteStore()
  const treeStore = useTreeStore()
  const tabsStore = useTabsStore()
  const { activeNote, saveStatus } = storeToRefs(noteStore)

  const historyRouteReady = ref(true)
  const noteLoadError = ref(false)
  let noteRouteRevision = 0
  watch(() => [activeNoteId.value, route.path] as const, async ([noteId, currentPath]) => {
    const revision = ++noteRouteRevision
    noteLoadError.value = false
    const isHistoryRoute = /^\/workspace\/note\/[^/]+\/history$/.test(String(currentPath))
    const isHistoryPath = isHistoryRoute || String(currentPath) === '/workspace/history'
    const noteBeforeSave = noteStore.activeNote
    historyRouteReady.value = !isHistoryRoute
    await finalizeActiveRecording()
    // Flush any pending edits on the note we're navigating away from before
    // resetting/loading state below. This must happen centrally here (rather
    // than relying solely on the individual navigation helpers like openNote/
    // openFolder) so that navigation paths which bypass those helpers (browser
    // back/forward, restored routes, programmatic router changes) don't drop
    // in-flight drafts. flushSave() is a no-op when there's nothing dirty.
    await flushSave()
    if (revision !== noteRouteRevision) return
    if (isHistoryPath && noteBeforeSave
      && noteStore.activeNote?.id === noteBeforeSave.id
      && (noteStore.isDirty || saveStatus.value === 'error')) {
      reportHistorySaveFailure()
      await router.replace(routeForNote(noteBeforeSave.id))
      return
    }
    if (!noteId || isHistoryRoute) {
      noteStore.clearNote()
      historyRouteReady.value = true
      return
    }
    if (noteStore.activeNote?.id === String(noteId)) {
      if (noteStore.activeNote.documentKind === 'notebook' && String(currentPath).endsWith('/canvas')) {
        await router.replace(`/workspace/note/${String(noteId)}`)
      }
      return
    }
    try {
      await noteStore.loadNote(noteId)
      if (noteStore.activeNote?.documentKind === 'notebook' && String(currentPath).endsWith('/canvas')) {
        await router.replace(`/workspace/note/${String(noteId)}`)
      }
    } catch {
      if (revision === noteRouteRevision) noteLoadError.value = true
    }
  }, { immediate: true })

  watch(activeNote, (note) => {
    if (!note) return
    tabsStore.syncActiveTab({ title: note.title || t('workspace.untitledNote'), icon: note.icon })
  })
  watch(saveStatus, (status) => { tabsStore.syncActiveTab({ isDirty: status === 'unsaved' || status === 'saving' }) })

  function updateTitle(value: string) { noteStore.setTitle(value); if (activeNoteId.value) treeStore.syncNoteMeta(activeNoteId.value, { title: value }) }
  function updateIcon(value: string) { noteStore.setIcon(value); if (activeNoteId.value) treeStore.syncNoteMeta(activeNoteId.value, { icon: value }) }
  function updateCover(value: string | null) { noteStore.setCover(value) }
  function updateContent(content: NoteDocument['content']) { noteStore.setContent(content) }
  function updateCanvas(canvas: NonNullable<NoteDocument['canvas']>) { noteStore.setCanvas(canvas) }
  function updateNotebook(snapshot: NotebookSnapshotV1) {
    const noteId = activeNoteId.value
    if (noteId) noteStore.setNotebookFromSession(snapshot, noteId)
  }
  function markContentDirty() { noteStore.markContentDirty() }
  async function renameNoteFromAgent(noteId: string, title: string) {
    // An open note's title is held by the note store until its next save; mirror the rename dialog.
    if (activeNoteId.value === noteId) { updateTitle(title); await flushSave(); return }
    await treeStore.renameNote(noteId, title)
  }

  return {
    historyRouteReady,
    noteLoadError,
    updateTitle,
    updateIcon,
    updateCover,
    updateContent,
    updateCanvas,
    updateNotebook,
    markContentDirty,
    renameNoteFromAgent,
  }
}
