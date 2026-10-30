import { computed, ref, type Ref } from 'vue'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import type {
  NevoSandboxModal,
  NevoSandboxUiContributionSnapshot,
  NevoSandboxWorkspaceView,
} from '../../../types/editor-plugin'
import type { WorkspaceRouteState } from './useWorkspaceRouteState'

export interface UseWorkspacePluginUiOptions {
  route: RouteLocationNormalizedLoaded
  routeState: WorkspaceRouteState
  dispatchPluginUiEvent: (
    pluginId: string,
    contributionId: string,
    event: { type: string; payload: unknown },
  ) => Promise<unknown> | undefined
}

// UI contributions published by sandboxed plugins (workspace views, sidebar
// items, modals) and the routing of events coming back from their frames.
export function useWorkspacePluginUi({ route, routeState, dispatchPluginUiEvent }: UseWorkspacePluginUiOptions) {
  const { routePluginId, routePluginViewId } = routeState
  const pluginUiContributions = ref<NevoSandboxUiContributionSnapshot>({
    workspaceViews: [],
    sidebarItems: [],
    modals: [],
  })
  const pluginUiReady = ref(false)
  const activePluginModal: Ref<NevoSandboxModal | null> = ref(null)
  const activePluginView = computed<NevoSandboxWorkspaceView | null>(() => {
    const pluginId = routePluginId.value
    if (!pluginId) return null
    const exact = pluginUiContributions.value.workspaceViews.find(view => view.route === route.path)
    if (exact) return exact
    const viewId = routePluginViewId.value
    return pluginUiContributions.value.workspaceViews.find(view =>
      view.pluginId === pluginId
      && (!viewId || view.id === viewId || view.id.endsWith(`.${viewId}`))) ?? null
  })

  function updatePluginContributions(snapshot: NevoSandboxUiContributionSnapshot) {
    pluginUiContributions.value = snapshot
    pluginUiReady.value = true
    if (
      activePluginModal.value
      && !snapshot.modals.some(modal => modal.id === activePluginModal.value?.id)
    ) {
      activePluginModal.value = null
    }
  }
  async function handlePluginFrameEvent(
    contribution: NevoSandboxWorkspaceView | NevoSandboxModal,
    event: { type: string; payload: unknown },
  ) {
    const payload = event.payload && typeof event.payload === 'object' && !Array.isArray(event.payload)
      ? event.payload as Record<string, unknown>
      : {}
    if (event.type === 'openModal' && typeof payload.modalId === 'string') {
      activePluginModal.value = pluginUiContributions.value.modals.find(modal =>
        modal.pluginId === contribution.pluginId && modal.id === payload.modalId) ?? null
    } else if (event.type === 'closeModal') {
      activePluginModal.value = null
    }
    await dispatchPluginUiEvent(contribution.pluginId, contribution.id, event)
  }

  return {
    pluginUiContributions,
    pluginUiReady,
    activePluginModal,
    activePluginView,
    updatePluginContributions,
    handlePluginFrameEvent,
  }
}
