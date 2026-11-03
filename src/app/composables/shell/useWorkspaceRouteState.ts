import { computed } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type { MobileWorkspaceTab } from '../../components/mobile/MobileBottomNav.vue'
import type { NoteViewMode } from '../../../features/canvas/canvasPreferences'

// Read-only view of the current route as the shell understands it: which
// entity is addressed and which top-level view is showing.
export function useWorkspaceRouteState(route: RouteLocationNormalizedLoaded) {
  const activeFolderId = computed(() => route.params.folderId ? String(route.params.folderId) : null)
  const activeNoteId = computed(() => route.params.noteId ? String(route.params.noteId) : null)
  const routeBoardId = computed(() => route.params.boardId ? String(route.params.boardId) : null)
  const routeDrawId = computed(() => route.params.drawId ? String(route.params.drawId) : null)
  const isGraphView = computed(() => route.path === '/workspace/graph')
  const isWorkspaceHome = computed(() => route.path === '/workspace')
  const isMobileLibraryView = computed(() => route.path === '/workspace/notes')
  const isMobileBoardsView = computed(() => route.path === '/workspace/boards')
  const isMobileMoreView = computed(() => route.path === '/workspace/more')
  const isMobilePrimaryView = computed(() =>
    isWorkspaceHome.value
    || isMobileLibraryView.value
    || isMobileBoardsView.value
    || isMobileMoreView.value,
  )
  const mobileActiveTab = computed<Exclude<MobileWorkspaceTab, 'search'>>(() => {
    if (isMobileLibraryView.value) return 'notes'
    if (isMobileBoardsView.value) return 'boards'
    if (isMobileMoreView.value) return 'more'
    return 'home'
  })
  const isKanbanView = computed(() => !!routeBoardId.value)
  const isDrawView = computed(() => !!routeDrawId.value)
  const isCanvasView = computed(() => /^\/workspace\/note\/[^/]+\/canvas$/.test(route.path))
  const isHistoryView = computed(() => /^\/workspace\/note\/[^/]+\/history$/.test(route.path))
  const isHistoryIndex = computed(() => route.path === '/workspace/history')
  const noteViewMode = computed<NoteViewMode>(() => isCanvasView.value ? 'canvas' : 'document')
  const routePluginId = computed(() => route.params.pluginId ? String(route.params.pluginId) : null)
  const routePluginViewId = computed(() => route.params.viewId ? String(route.params.viewId) : null)
  const isSandboxPluginRoute = computed(() => routePluginId.value !== null)

  return {
    activeFolderId,
    activeNoteId,
    routeBoardId,
    routeDrawId,
    isGraphView,
    isWorkspaceHome,
    isMobileLibraryView,
    isMobileBoardsView,
    isMobileMoreView,
    isMobilePrimaryView,
    mobileActiveTab,
    isKanbanView,
    isDrawView,
    isCanvasView,
    isHistoryView,
    isHistoryIndex,
    noteViewMode,
    routePluginId,
    routePluginViewId,
    isSandboxPluginRoute,
  }
}

export type WorkspaceRouteState = ReturnType<typeof useWorkspaceRouteState>
