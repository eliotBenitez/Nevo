import { computed, ref, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useKanbanStore } from '../../../stores/kanban'
import { useWorkspaceStore } from '../../../stores/workspace'
import { isPluginEnabled } from '../../../utils/system-plugins'
import { workspaceHomeFavoriteKey } from '../../../utils/workspace-settings'
import type { NevoSandboxUiContributionSnapshot } from '../../../types/editor-plugin'
import type { WorkspaceHomeFavorite } from '../../../types/workspace'
import { useWorkspaceHome, type WorkspaceHomeItem } from '../useWorkspaceHome'

export interface UseWorkspaceHomeShellOptions {
  pluginUiContributions: Readonly<Ref<NevoSandboxUiContributionSnapshot>>
  pluginUiReady: Readonly<Ref<boolean>>
  openNote: (noteId: string) => void
  openRoute: (path: string) => void
}

// Workspace home screen data (favorites, recents), the kanban plugin switch and
// the board list that feed it and the sidebar.
export function useWorkspaceHomeShell({ pluginUiContributions, pluginUiReady, openNote, openRoute }: UseWorkspaceHomeShellOptions) {
  const workspaceStore = useWorkspaceStore()
  const kanbanStore = useKanbanStore()
  const { manifest, settings, plugins } = storeToRefs(workspaceStore)

  const homeFavoritesManagerOpen = ref(false)
  const kanbanEnabled = computed(() => isPluginEnabled(plugins.value, 'nevo.kanban'))
  const boardsMeta = computed(() => kanbanStore.boardsList.map(b => ({ id: b.id, title: b.title, icon: b.icon, updatedAt: b.updatedAt })))
  const workspaceHome = useWorkspaceHome({
    manifest,
    settings,
    boards: boardsMeta,
    kanbanEnabled,
    pluginViews: computed(() => pluginUiContributions.value.workspaceViews),
    pluginItems: computed(() => pluginUiContributions.value.sidebarItems),
    pluginUiReady,
    updateSettings: workspaceStore.updateSettings,
    notePreviews: computed(() => workspaceStore.sidebarNotePreviews),
  })
  const homeFavoriteKeys = computed(() =>
    settings.value.general.homeFavorites.map(workspaceHomeFavoriteKey),
  )

  function openHomeItem(item: WorkspaceHomeItem) {
    if (!item.available || !item.route) return
    if (item.kind === 'note' && item.favorite.kind === 'note') {
      openNote(item.favorite.id)
      return
    }
    openRoute(item.route)
  }
  async function toggleHomeFavorite(favorite: WorkspaceHomeFavorite) {
    const result = await workspaceHome.toggleFavorite(favorite)
    if (result === 'limit') homeFavoritesManagerOpen.value = true
  }

  return {
    homeFavoritesManagerOpen,
    kanbanEnabled,
    boardsMeta,
    workspaceHome,
    homeFavoriteKeys,
    openHomeItem,
    toggleHomeFavorite,
  }
}
