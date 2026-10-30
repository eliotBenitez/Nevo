import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUiStore } from '../../../stores/ui'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useTreeStore } from '../../../stores/tree'
import type { SidebarContentMode } from '../../../types/workspace'
import { useFloatingSidebar } from '../useFloatingSidebar'
import { createEditorLayoutScrollStabilizer } from '../editor/editorLayoutScrollStabilizer'

export interface UseWorkspaceSidebarLayoutOptions {
  editorRootEl: Readonly<Ref<HTMLElement | null>>
  useDrawerNavigation: Readonly<Ref<boolean>>
  isWorkspaceHome: Readonly<Ref<boolean>>
}

// Desktop sidebar presentation (docked/floating, tag preview) and the editor
// scroll stabilisation that has to run whenever the layout width changes.
export function useWorkspaceSidebarLayout({ editorRootEl, useDrawerNavigation, isWorkspaceHome }: UseWorkspaceSidebarLayoutOptions) {
  const uiStore = useUiStore()
  const treeStore = useTreeStore()
  const { settings } = storeToRefs(useWorkspaceStore())
  const { tree } = storeToRefs(treeStore)
  const { sidebarOpen, rightPanelOpen } = storeToRefs(uiStore)

  const sidebarTree = computed(() => settings.value.workspace.rootNotesVisible ? tree.value : tree.value.filter(node => node.kind !== 'note'))
  // Clicking a tag drills into the tag view for as long as the user stays there. The
  // stored setting is their default, not something a pill click is allowed to rewrite.
  const sidebarModeOverride = ref<SidebarContentMode | null>(null)
  const sidebarContentMode = computed(() => sidebarModeOverride.value ?? settings.value.workspace.sidebarContentMode)
  watch(() => settings.value.workspace.sidebarContentMode, () => { sidebarModeOverride.value = null })
  const sidebarLayout = computed(() => settings.value.workspace.sidebarLayout)
  const editorLayoutScrollStabilizer = createEditorLayoutScrollStabilizer({
    getEditorRoot: () => editorRootEl.value,
  })
  const editorWidthLayoutKey = computed(() => [
    useDrawerNavigation.value ? 'drawer' : 'desktop',
    sidebarLayout.value,
    sidebarLayout.value === 'docked' && sidebarOpen.value ? 'sidebar-open' : 'sidebar-closed',
    rightPanelOpen.value ? 'right-open' : 'right-closed',
  ].join(':'))
  watch(editorWidthLayoutKey, () => {
    if (isWorkspaceHome.value) return
    editorLayoutScrollStabilizer.preserve()
  }, { flush: 'pre' })
  onBeforeUnmount(() => {
    editorLayoutScrollStabilizer.destroy()
  })
  const floatingPinned = ref(false)
  const { revealed: floatingRevealed, onEdgeEnter, onSidebarEnter, onSidebarLeave } = useFloatingSidebar(
    computed(() => sidebarLayout.value === 'floating'),
    floatingPinned,
  )
  function toggleSidebarOrPin() {
    if (sidebarLayout.value === 'floating') floatingPinned.value = !floatingPinned.value
    else uiStore.toggleSidebar()
  }

  return {
    sidebarTree,
    sidebarModeOverride,
    sidebarContentMode,
    sidebarLayout,
    floatingPinned,
    floatingRevealed,
    onEdgeEnter,
    onSidebarEnter,
    onSidebarLeave,
    toggleSidebarOrPin,
  }
}
