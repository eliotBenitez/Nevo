import { nextTick, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import type { Router } from 'vue-router'
import { useNoteStore } from '../../../stores/note'
import { useTabsStore } from '../../../stores/tabs'
import { useTreeStore } from '../../../stores/tree'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useToast } from '../../../ui/composables/useToast'
import { readRememberedNoteView, rememberNoteView, type NoteViewMode } from '../../../features/canvas/canvasPreferences'
import type { WorkspaceRouteState } from './useWorkspaceRouteState'

export interface UseWorkspaceNavigationOptions {
  router: Router
  routeState: WorkspaceRouteState
  flushSave: () => Promise<void> | void
  mobileSidebarOpen: Ref<boolean>
  editorRootEl: Readonly<Ref<HTMLElement | null>>
}

// Route-changing actions of the shell: opening notes/folders/graph/boards/draw
// views and history, closing tabs. Every entry flushes the pending save first.
export function useWorkspaceNavigation(options: UseWorkspaceNavigationOptions) {
  const { router, routeState, flushSave, mobileSidebarOpen, editorRootEl } = options
  const { t } = useI18n()
  const { showToast } = useToast()
  const treeStore = useTreeStore()
  const tabsStore = useTabsStore()
  const noteStore = useNoteStore()
  const workspaceStore = useWorkspaceStore()
  const { manifest } = storeToRefs(workspaceStore)
  const { activeNote, saveStatus } = storeToRefs(noteStore)
  const {
    activeFolderId,
    activeNoteId,
    routeDrawId,
    isGraphView,
    isDrawView,
    isHistoryView,
    isHistoryIndex,
    noteViewMode,
  } = routeState

  function reportHistorySaveFailure() {
    showToast({ message: t('workspace.history.saveBeforeHistoryError'), variant: 'error' })
  }
  async function flushBeforeHistory(): Promise<boolean> {
    const noteIdBeforeSave = noteStore.activeNote?.id
    await flushSave()
    if (noteIdBeforeSave
      && noteStore.activeNote?.id === noteIdBeforeSave
      && (noteStore.isDirty || saveStatus.value === 'error')) {
      reportHistorySaveFailure()
      return false
    }
    return true
  }
  async function openHistory(noteId: string | null = null) {
    mobileSidebarOpen.value = false
    if (!await flushBeforeHistory()) return
    if (noteId) {
      await router.push(`/workspace/note/${noteId}/history`)
      return
    }
    await router.push('/workspace/history')
  }
  function toggleHistory() {
    if (isHistoryView.value || isHistoryIndex.value) { router.push('/workspace/history'); return }
    openHistory()
  }
  function scrollToAnchorInEditor(anchor: string) {
    const root = editorRootEl.value
    if (!root) return
    const pm = root.querySelector('.ProseMirror')
    if (!pm) return
    const normalized = anchor.trim()
    const headings = Array.from(pm.querySelectorAll('h1, h2, h3, h4, h5, h6')) as HTMLElement[]
    const target = headings.find(h => h.textContent?.trim() === normalized)
      ?? headings.find(h => (h.textContent?.trim().toLowerCase() ?? '') === normalized.toLowerCase())
    target?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  function routeForNote(noteId: string, mode?: NoteViewMode): string {
    if (activeNote.value?.id === noteId && activeNote.value.documentKind === 'notebook') return `/workspace/note/${noteId}`
    const workspaceId = manifest.value?.id
    const resolved = mode ?? (workspaceId ? readRememberedNoteView(workspaceId, noteId) : 'document')
    return resolved === 'canvas'
      ? `/workspace/note/${noteId}/canvas`
      : `/workspace/note/${noteId}`
  }

  function openNote(noteId: string, anchor?: string | null) {
    mobileSidebarOpen.value = false
    const meta = treeStore.noteById.get(noteId)
    tabsStore.openTab(noteId, meta?.title ?? t('workspace.untitledNote'), meta?.icon ?? '📄')
    // Draw and history routes carry the parent noteId, but opening that same note
    // must still navigate back to its editor route.
    const sameNote = activeNoteId.value === noteId && !isGraphView.value && !isDrawView.value && !isHistoryView.value
    if (sameNote) {
      // Already viewing the target note — just scroll to the anchor if any.
      if (anchor) {
        nextTick(() => scrollToAnchorInEditor(anchor))
      }
      return
    }
    flushSave()
    const isReturningToSameNoteFromHistory = isHistoryView.value && activeNoteId.value === noteId
    const targetMode = anchor || isReturningToSameNoteFromHistory ? 'document' : undefined
    router.push(routeForNote(noteId, targetMode))
    if (anchor) {
      // Give the new note time to render before scrolling to the heading.
      nextTick(() => { setTimeout(() => scrollToAnchorInEditor(anchor), 60) })
    }
  }
  function changeNoteView(mode: NoteViewMode) {
    const noteId = activeNoteId.value
    const workspaceId = manifest.value?.id
    if (!noteId || !workspaceId || activeNote.value?.documentKind === 'notebook' || noteViewMode.value === mode) return
    rememberNoteView(workspaceId, noteId, mode)
    void router.push(routeForNote(noteId, mode))
  }
  function closeTab(tabId: string) {
    // Only the active tab owns the route. `closeTab` also returns null when a
    // background tab is closed, so navigating on a null result used to throw the
    // user out of the note they were editing — unloading it and reloading it on
    // the way back, which is expensive on large documents.
    const wasActive = tabsStore.activeTabId === tabId
    const nextNoteId = tabsStore.closeTab(tabId)
    if (!wasActive) return
    if (nextNoteId) router.push(routeForNote(nextNoteId))
    else router.push('/workspace')
  }
  function closeNoteTab(noteId: string) {
    const tab = tabsStore.tabByNoteId(noteId)
    return tab ? tabsStore.closeTab(tab.id) : null
  }
  function openFolder(folderId: string) { mobileSidebarOpen.value = false; if (activeFolderId.value === folderId) return; flushSave(); router.push(`/workspace/folder/${folderId}`) }
  function openWorkspaceHome() { mobileSidebarOpen.value = false; flushSave(); router.push('/workspace') }
  function openGraph() { mobileSidebarOpen.value = false; if (isGraphView.value) return; flushSave(); router.push('/workspace/graph') }
  function openBoard(boardId: string) { mobileSidebarOpen.value = false; flushSave(); router.push(`/workspace/plugin/nevo.kanban/${boardId}`) }
  // Opens an arbitrary in-app route (plugin sidebar items, home favorites).
  function openRoute(path: string) {
    mobileSidebarOpen.value = false
    flushSave()
    void router.push(path)
  }
  // Open the full-canvas drawing editor for a draw_block. The noteId is the
  // parent note (so save-target stays valid); drawId identifies the block.
  function openDraw(noteId: string, drawId: string) {
    mobileSidebarOpen.value = false
    if (isDrawView.value && routeDrawId.value === drawId && activeNoteId.value === noteId) return
    flushSave()
    router.push(`/workspace/draw/${noteId}/${drawId}`)
  }
  function backToOnboarding() { mobileSidebarOpen.value = false; flushSave(); router.push('/onboarding') }

  return {
    reportHistorySaveFailure,
    openHistory,
    toggleHistory,
    routeForNote,
    openNote,
    changeNoteView,
    closeTab,
    closeNoteTab,
    openFolder,
    openWorkspaceHome,
    openGraph,
    openBoard,
    openRoute,
    openDraw,
    backToOnboarding,
  }
}
