import { computed, nextTick, ref, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import type { Router } from 'vue-router'
import type { MobileWorkspaceTab } from '../../components/mobile/MobileBottomNav.vue'
import { useMobileBackButton } from '../../../composables/useMobileBackButton'
import { useNoteStore } from '../../../stores/note'
import { useTreeStore } from '../../../stores/tree'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { NoteViewMode } from '../../../features/canvas/canvasPreferences'
import type { WorkspaceRouteState } from './useWorkspaceRouteState'

export interface UseWorkspaceMobileShellOptions {
  router: Router
  routeState: WorkspaceRouteState
  runtime: Readonly<Ref<{ isMobileRuntime: boolean }>>
  isPhone: Readonly<Ref<boolean>>
  mobileSidebarOpen: Ref<boolean>
  searchOverlayOpen: Readonly<Ref<boolean>>
  isSettingsView: Readonly<Ref<boolean>>
  isArchiveView: Readonly<Ref<boolean>>
  leaveSystemView: () => void
  /** Overlays the phone back button dismisses, in dismissal order after the archive view. */
  layers: {
    homeFavoritesManagerOpen: Ref<boolean>
    boardModalOpen: Ref<boolean>
    templateCreatePickerOpen: Ref<boolean>
    createFolderModalOpen: Ref<boolean>
    obsidianImportOpen: Ref<boolean>
    notionImportOpen: Ref<boolean>
  }
  editorRootEl: Readonly<Ref<HTMLElement | null>>
  routeForNote: (noteId: string, mode?: NoteViewMode) => string
  changeNoteView: (mode: NoteViewMode) => void
  openGraph: () => void
  flushSave: () => Promise<void> | void
  runWorkspaceSearch: () => Promise<void>
  deleteNote: (note: { id: string; title: string; folderId: string | null }) => void
  exportNoteAsMarkdown: () => void
}

// Phone layout: bottom-tab navigation, editor header, note-details sheet, the
// hardware/gesture back button, and which chrome is visible per route.
export function useWorkspaceMobileShell(options: UseWorkspaceMobileShellOptions) {
  const {
    router, routeState, runtime, isPhone, mobileSidebarOpen, searchOverlayOpen,
    isSettingsView, isArchiveView, leaveSystemView, layers, editorRootEl,
    routeForNote, changeNoteView, openGraph, flushSave, runWorkspaceSearch,
    deleteNote, exportNoteAsMarkdown,
  } = options
  const workspaceStore = useWorkspaceStore()
  const treeStore = useTreeStore()
  const noteStore = useNoteStore()
  const { manifest } = storeToRefs(workspaceStore)
  const { folderById } = storeToRefs(treeStore)
  const { activeNote } = storeToRefs(noteStore)
  const {
    activeFolderId, activeNoteId, routeBoardId, isGraphView, isDrawView, isKanbanView,
    isCanvasView, isHistoryView, isHistoryIndex, isMobileLibraryView, isMobileBoardsView,
    isMobileMoreView, isMobilePrimaryView, isWorkspaceHome,
  } = routeState
  const mobileNoteDetailsOpen = ref(false)

  const workspaceBackEnabled = computed(() =>
    runtime.value.isMobileRuntime
    && isPhone.value
    && !searchOverlayOpen.value
    && !isSettingsView.value
    && (
      mobileSidebarOpen.value
      || mobileNoteDetailsOpen.value
      || isArchiveView.value
      || layers.homeFavoritesManagerOpen.value
      || layers.boardModalOpen.value
      || layers.templateCreatePickerOpen.value
      || layers.createFolderModalOpen.value
      || layers.obsidianImportOpen.value
      || layers.notionImportOpen.value
      || !isWorkspaceHome.value
    ),
  )

  function hasInAppBackEntry(): boolean {
    const back = (router.options.history.state as { back?: unknown } | undefined)?.back
    return typeof back === 'string' && back.startsWith('/workspace')
  }

  async function handleMobileBack() {
    if (mobileNoteDetailsOpen.value) {
      mobileNoteDetailsOpen.value = false
      return
    }
    if (mobileSidebarOpen.value) {
      mobileSidebarOpen.value = false
      return
    }
    if (isArchiveView.value) {
      leaveSystemView()
      return
    }
    for (const layer of [
      layers.homeFavoritesManagerOpen,
      layers.boardModalOpen,
      layers.templateCreatePickerOpen,
      layers.createFolderModalOpen,
      layers.obsidianImportOpen,
      layers.notionImportOpen,
    ]) {
      if (layer.value) {
        layer.value = false
        return
      }
    }
    if (isDrawView.value && activeNoteId.value) {
      await router.push(routeForNote(activeNoteId.value))
      return
    }
    if (isHistoryIndex.value) {
      if (hasInAppBackEntry()) { router.back(); return }
      await router.push('/workspace')
      return
    }
    if ((isCanvasView.value || isHistoryView.value) && activeNoteId.value) {
      await router.push('/workspace/history')
      return
    }
    if (activeNoteId.value || activeFolderId.value) {
      await router.push('/workspace/notes')
      return
    }
    if (routeBoardId.value) {
      await router.push('/workspace/boards')
      return
    }
    if (isMobileLibraryView.value || isMobileBoardsView.value || isMobileMoreView.value) {
      await router.push('/workspace')
      return
    }
    if (isGraphView.value && hasInAppBackEntry()) {
      router.back()
      return
    }
    await router.push('/workspace')
  }

  useMobileBackButton(handleMobileBack, workspaceBackEnabled)

  const showMobileBottomNav = computed(() => isPhone.value && isMobilePrimaryView.value)
  const showMobileEditorHeader = computed(() =>
    isPhone.value
    && Boolean(activeNoteId.value)
    && !isDrawView.value
    && !isHistoryView.value
    && !mobileNoteDetailsOpen.value,
  )
  const hideWorkspaceTitlebar = computed(() =>
    isPhone.value
    && (
      isMobilePrimaryView.value
      || Boolean(activeNoteId.value)
      || isGraphView.value
      || isHistoryIndex.value
      || isKanbanView.value
      || isSettingsView.value
      || isArchiveView.value
      || mobileNoteDetailsOpen.value
    ),
  )
  const mobileNoteFolderPath = computed(() => {
    const note = activeNote.value
    const workspace = manifest.value
    if (!workspace) return ''
    if (!note?.folderId) return workspace.name

    const labels: string[] = []
    let folderId: string | null = note.folderId
    while (folderId) {
      const folder = folderById.value.get(folderId)
      if (!folder) break
      labels.unshift(folder.title)
      folderId = folder.parentId
    }
    return labels.length ? labels.join(' / ') : workspace.name
  })

  function navigateMobile(tab: MobileWorkspaceTab) {
    if (tab === 'search') {
      void runWorkspaceSearch()
      return
    }
    const routeByTab: Record<Exclude<MobileWorkspaceTab, 'search'>, string> = {
      home: '/workspace',
      notes: '/workspace/notes',
      boards: '/workspace/boards',
      more: '/workspace/more',
    }
    flushSave()
    void router.push(routeByTab[tab])
  }
  function backFromMobileEditor() {
    if (isCanvasView.value && activeNoteId.value) {
      changeNoteView('document')
      return
    }
    flushSave()
    void router.push('/workspace/notes')
  }
  function openMobileNoteDetails() {
    if (!activeNote.value) return
    mobileNoteDetailsOpen.value = true
  }
  function deleteMobileNote() {
    const note = activeNote.value
    if (!note) return
    deleteNote({ id: note.id, title: note.title, folderId: note.folderId })
  }
  function openMobileOutline() {
    mobileNoteDetailsOpen.value = false
    void nextTick(() => {
      editorRootEl.value?.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6')
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    })
  }
  function openGraphFromMobileDetails() {
    mobileNoteDetailsOpen.value = false
    openGraph()
  }

  return {
    mobileNoteDetailsOpen,
    showMobileBottomNav,
    showMobileEditorHeader,
    hideWorkspaceTitlebar,
    mobileNoteFolderPath,
    navigateMobile,
    backFromMobileEditor,
    openMobileNoteDetails,
    deleteMobileNote,
    exportMobileNote: exportNoteAsMarkdown,
    openMobileOutline,
    openGraphFromMobileDetails,
  }
}
