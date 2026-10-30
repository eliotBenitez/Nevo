import { ref, watch, type ComputedRef, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import { useKanbanStore } from '../../../stores/kanban'
import { useTabsStore } from '../../../stores/tabs'
import { useTreeStore } from '../../../stores/tree'
import { useUiStore } from '../../../stores/ui'
import { useWorkspaceStore } from '../../../stores/workspace'
import { rememberNoteView } from '../../../features/canvas/canvasPreferences'
import { resolveStartupTarget } from '../../../utils/workspace-startup'
import { isSystemPath } from '../../routing/systemRoutes'
import { forgetAllNoteViews } from '../editor/noteViewMemory'
import type { WorkspaceRouteState } from './useWorkspaceRouteState'

export interface UseWorkspaceLifecycleWatchersOptions {
  router: Router
  route: RouteLocationNormalizedLoaded
  routeState: WorkspaceRouteState
  isPhone: Readonly<Ref<boolean>>
  useDrawerNavigation: Readonly<Ref<boolean>>
  mobileSidebarOpen: Ref<boolean>
  mobileNoteDetailsOpen: Ref<boolean>
  kanbanEnabled: Readonly<Ref<boolean>>
  boardsMeta: ComputedRef<Array<{ id: string }>>
}

// Reactions to workspace/route/settings changes that keep the shell coherent:
// onboarding redirect, board loading, per-workspace resets, startup route
// restore, sidebar default state, and last-context persistence.
export function useWorkspaceLifecycleWatchers(options: UseWorkspaceLifecycleWatchersOptions) {
  const { router, route, routeState, isPhone, useDrawerNavigation, mobileSidebarOpen, mobileNoteDetailsOpen, kanbanEnabled, boardsMeta } = options
  const { activeNoteId, activeFolderId, routeBoardId, noteViewMode, isDrawView, isHistoryView } = routeState
  const { t } = useI18n()
  const workspaceStore = useWorkspaceStore()
  const treeStore = useTreeStore()
  const tabsStore = useTabsStore()
  const kanbanStore = useKanbanStore()
  const uiStore = useUiStore()
  const { sidebarOpen } = storeToRefs(uiStore)
  const { manifest, settings } = storeToRefs(workspaceStore)
  const restoredRouteForWorkspace = ref<string | null>(null)

  watch(manifest, (workspace) => {
    if (!workspace) { router.replace('/onboarding'); return }
    if (kanbanEnabled.value) kanbanStore.loadBoards()
  }, { immediate: true })
  watch(kanbanEnabled, (enabled) => {
    if (enabled) kanbanStore.loadBoards()
  })
  watch(() => workspaceStore.activePath, () => { restoredRouteForWorkspace.value = null; tabsStore.clear(); forgetAllNoteViews() })
  watch(() => useDrawerNavigation.value, (drawerMode) => { if (!drawerMode) mobileSidebarOpen.value = false }, { immediate: true })
  watch(
    () => [isPhone.value, route.path] as const,
    ([phone, path]) => {
      if (!phone && ['/workspace/notes', '/workspace/boards', '/workspace/more'].includes(path)) {
        void router.replace('/workspace')
      }
    },
    { immediate: true },
  )
  watch(() => route.fullPath, () => {
    mobileSidebarOpen.value = false
    mobileNoteDetailsOpen.value = false
  })
  watch(
    () => [manifest.value?.id, activeNoteId.value, noteViewMode.value] as const,
    ([workspaceId, noteId, mode]) => {
      if (workspaceId && noteId && !isDrawView.value && !isHistoryView.value) rememberNoteView(workspaceId, noteId, mode)
    },
    { immediate: true },
  )
  watch(routeBoardId, (boardId, previousBoardId) => {
    if (boardId) {
      if (boardId !== previousBoardId) kanbanStore.closeCard()
      kanbanStore.activeBoardId = boardId
      return
    }
    kanbanStore.activeBoardId = null
    kanbanStore.closeCard()
  }, { immediate: true })
  watch(
    () => ({
      workspacePath: workspaceStore.activePath,
      currentRoute: route.fullPath,
      restoreLastContext: settings.value.general.restoreLastContext,
      noteId: settings.value.general.lastContext.noteId,
      folderId: settings.value.general.lastContext.folderId,
      defaultStartupView: settings.value.general.defaultStartupView,
      startupNoteId: settings.value.general.startupNoteId
    }),
    async ({ workspacePath, currentRoute, restoreLastContext, noteId, folderId, defaultStartupView, startupNoteId }) => {
      if (!workspacePath || currentRoute !== '/workspace' || restoredRouteForWorkspace.value === workspacePath) return
      restoredRouteForWorkspace.value = workspacePath

      const target = resolveStartupTarget({
        defaultStartupView,
        startupNoteId,
        restoreLastContext,
        lastNoteId: noteId,
        lastFolderId: folderId,
        firstBoardId: boardsMeta.value?.[0]?.id ?? null,
      })

      if (target.kind === 'note') {
        const meta = treeStore.noteById.get(target.noteId)
        tabsStore.openTab(target.noteId, meta?.title ?? t('workspace.untitledNote'), meta?.icon ?? '📄')
        await router.replace(`/workspace/note/${target.noteId}`)
      } else if (target.kind === 'folder') {
        await router.replace(`/workspace/folder/${target.folderId}`)
      } else if (target.kind === 'graph') {
        await router.replace('/workspace/graph')
      } else if (target.kind === 'board') {
        await router.replace(`/workspace/plugin/nevo.kanban/${target.boardId}`)
      }
    },
    { immediate: true },
  )
  watch(
    () => workspaceStore.activePath,
    (path) => {
      if (!path) return
      const defaultState = settings.value.workspace.sidebarDefaultState
      sidebarOpen.value = defaultState === 'expanded'
    },
    { immediate: true },
  )
  watch(() => [workspaceStore.activePath, activeNoteId.value, activeFolderId.value, route.path], async ([workspacePath, noteId, folderId, currentPath]) => {
    if (!workspacePath) return
    if (isSystemPath(String(currentPath)) || String(currentPath) === '/workspace/history' || String(currentPath).endsWith('/history')) return
    await workspaceStore.updateLastContext({ noteId: noteId ? String(noteId) : null, folderId: folderId ? String(folderId) : null })
  })
}
