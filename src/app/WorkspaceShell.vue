<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, ref, toRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { History, Menu, PanelLeft, Settings2 } from '../ui/icons'
import { useI18n } from 'vue-i18n'
import WindowControls from '../ui/primitives/WindowControls.vue'
import WorkspaceRightPanel from './components/WorkspaceRightPanel.vue'
import AiChatHost from './components/ai-chat/AiChatHost.vue'
import WorkspaceSidebar from './components/WorkspaceSidebar.vue'
import WorkspaceDrawer from './components/WorkspaceDrawer.vue'
import WorkspaceHome from './components/WorkspaceHome.vue'
import WorkspaceHomeFavoritesManager from './components/WorkspaceHomeFavoritesManager.vue'
import MobileBoardsView from './components/mobile/MobileBoardsView.vue'
import MobileBottomNav from './components/mobile/MobileBottomNav.vue'
import MobileEditorHeader from './components/mobile/MobileEditorHeader.vue'
import MobileLibraryView from './components/mobile/MobileLibraryView.vue'
import MobileMoreView from './components/mobile/MobileMoreView.vue'
import MobileNoteDetailsView from './components/mobile/MobileNoteDetailsView.vue'
import SandboxPluginFrame from './components/plugins/SandboxPluginFrame.vue'
import WorkspacePluginModal from './components/WorkspacePluginModal.vue'
const WorkspaceNoteHost = defineAsyncComponent(() => import('./components/WorkspaceNoteHost.vue'))
const WorkspaceArchiveView = defineAsyncComponent(() => import('./components/archive/WorkspaceArchiveView.vue'))
const PdfPreviewModal = defineAsyncComponent(() => import('./components/PdfPreviewModal.vue'))
const DocxPreviewModal = defineAsyncComponent(() => import('./components/DocxPreviewModal.vue'))
const WorkspaceSettingsView = defineAsyncComponent(() => import('./components/settings/WorkspaceSettingsView.vue'))
const ObsidianImportModal = defineAsyncComponent(() => import('./components/ObsidianImportModal.vue'))
const NotionImportModal = defineAsyncComponent(() => import('./components/NotionImportModal.vue'))
import WorkspaceRenameModal from './components/WorkspaceRenameModal.vue'
import UpdateDialog from './components/UpdateDialog.vue'
const TemplatePickerModal = defineAsyncComponent(() => import('./components/templates/TemplatePickerModal.vue'))
import TitleBarSearch from './components/TitleBarSearch.vue'
import WorkspaceSearchOverlay from './components/WorkspaceSearchOverlay.vue'
import ProductTourOverlay from '../features/onboarding/tour/ProductTourOverlay.vue'
import FirstUseHintPopover from '../features/onboarding/hints/FirstUseHintPopover.vue'
import TitleBarTabs from './components/TitleBarTabs.vue'
const GraphView = defineAsyncComponent(() => import('../features/graph/GraphView.vue'))
const KanbanView = defineAsyncComponent(() => import('../features/databases/kanban/KanbanView.vue'))
const KanbanBoardModal = defineAsyncComponent(() => import('../features/databases/kanban/KanbanBoardModal.vue'))
const DrawView = defineAsyncComponent(() => import('../features/draw/DrawView.vue'))
const HistoryView = defineAsyncComponent(() => import('../features/history/HistoryView.vue'))
const HistoryNotePicker = defineAsyncComponent(() => import('../features/history/HistoryNotePicker.vue'))
import { useUiStore } from '../stores/ui'
import { useAiChatStore } from '../stores/aiChat'
import { useKanbanStore } from '../stores/kanban'
import { useWorkspaceStore } from '../stores/workspace'
import { useNoteStore } from '../stores/note'
import { useTabsStore } from '../stores/tabs'
import { useOnboardingStore } from '../stores/onboarding'
import { useNotePersistence } from '../composables/useNotePersistence'
import { useDeviceLayout } from '../composables/useDeviceLayout'
import { useAppUpdater } from '../composables/useAppUpdater'
import { useWorkspaceKeymap } from './composables/useWorkspaceKeymap'
import { useSystemViews } from './composables/useSystemViews'
import { useMcpBridge } from './composables/useMcpBridge'
import { useMcpBridgeHost } from './composables/useMcpBridgeHost'
import { useWorkspaceRouteState } from './composables/shell/useWorkspaceRouteState'
import { useWorkspaceNavigation } from './composables/shell/useWorkspaceNavigation'
import { useWorkspaceSearchTargets } from './composables/shell/useWorkspaceSearchTargets'
import { useWorkspaceCreation } from './composables/shell/useWorkspaceCreation'
import { useWorkspaceBoardModal } from './composables/shell/useWorkspaceBoardModal'
import { useWorkspacePluginUi } from './composables/shell/useWorkspacePluginUi'
import { useWorkspaceHomeShell } from './composables/shell/useWorkspaceHomeShell'
import { useWorkspaceContainerOverview } from './composables/shell/useWorkspaceContainerOverview'
import { useWorkspaceMobileShell } from './composables/shell/useWorkspaceMobileShell'
import { useWorkspaceTreeActions } from './composables/shell/useWorkspaceTreeActions'
import { useWorkspaceSidebarLayout } from './composables/shell/useWorkspaceSidebarLayout'
import { useWorkspaceAppearance } from './composables/shell/useWorkspaceAppearance'
import { useWorkspaceLifecycleWatchers } from './composables/shell/useWorkspaceLifecycleWatchers'
import { useWorkspaceNoteSession } from './composables/shell/useWorkspaceNoteSession'
import type { NevoSandboxSidebarItem } from '../types/editor-plugin'

const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()

const uiStore = useUiStore()
const aiChatStore = useAiChatStore()
const { rightPanelOpen, sidebarOpen } = storeToRefs(uiStore)
const workspaceStore = useWorkspaceStore()
const noteStore = useNoteStore()
const onboardingStore = useOnboardingStore()
const tabsStore = useTabsStore()
const kanbanStore = useKanbanStore()
const { manifest, settings, diagnostics } = storeToRefs(workspaceStore)
const { activeNote, saveStatus } = storeToRefs(noteStore)
const { tabs, activeTabId } = storeToRefs(tabsStore)
const { activeBoardId } = storeToRefs(kanbanStore)

// Starts or stops the local MCP bridge to match the workspace's access mode,
// and serves the requests it can only answer from the webview.
useMcpBridge()
useMcpBridgeHost({
  openNote: noteId => openNote(noteId),
  renameNote: (noteId, title) => renameNoteFromAgent(noteId, title),
})

const appUpdater = useAppUpdater()

// Silently check for updates once the workspace shell mounts; the dialog only
// appears when a newer version is actually available.
onMounted(() => {
  void appUpdater.check({ silent: true })
  // Wait for the shell's first paint (nextTick for the DOM update, rAF for
  // the browser to actually render it) so the tour's data-tour targets exist
  // and have real layout before useProductTour measures them.
  void nextTick(() => {
    requestAnimationFrame(() => onboardingStore.maybeStartTour())
  })
})

const editorPaneRef = ref<{
  editorRoot: HTMLElement | null
  flushPendingContent?: () => void | Promise<void>
  updateDrawBlock?: (payload: { drawId: string; svgPreview: string; src: string; title?: string }) => void
  dispatchPluginUiEvent?: (
    pluginId: string,
    contributionId: string,
    event: { type: string; payload: unknown },
  ) => Promise<unknown>
  openFindInNote?: (withReplace?: boolean) => boolean
  toggleDictation?: () => void
} | null>(null)
const editorRootEl = computed(() => editorPaneRef.value?.editorRoot ?? null)
const routeState = useWorkspaceRouteState(route)
const {
  activeFolderId, activeNoteId, routeBoardId, routeDrawId, isGraphView, isWorkspaceHome,
  isMobileLibraryView, isMobileBoardsView, isMobileMoreView, isMobilePrimaryView, mobileActiveTab,
  isKanbanView, isDrawView, isHistoryView, isHistoryIndex, noteViewMode, isSandboxPluginRoute,
} = routeState
const workspaceNoteHostKey = computed(() => `${workspaceStore.backendKind ?? 'none'}:${workspaceStore.activePath ?? ''}:${activeNoteId.value ?? 'empty'}`)
const isNotebookNote = computed(() => activeNote.value?.documentKind === 'notebook')
const activeNoteFormat = computed(() => noteStore.getActiveNoteFormat(activeNoteId.value ?? undefined))
const { flushSave } = useNotePersistence()
const mobileSidebarOpen = ref(false)
const { runtime, isPhone, useDrawerNavigation, useCompactHeader, useFullscreenDialogs, shellStyle } = useDeviceLayout()

const {
  isSettingsView,
  isArchiveView,
  settingsSection,
  openSettings,
  openArchive,
  toggleSettings,
  toggleArchive,
  leaveSystemView,
  setPendingReveal,
} = useSystemViews({
  router,
  route,
  isPhone,
  closeMobileSidebar: () => { mobileSidebarOpen.value = false },
})
const openTrash = openArchive
const toggleTrash = toggleArchive

const {
  reportHistorySaveFailure, openHistory, toggleHistory, routeForNote, openNote, changeNoteView,
  closeTab, closeNoteTab, openFolder, openWorkspaceHome, openGraph, openBoard, openRoute,
  openDraw, backToOnboarding,
} = useWorkspaceNavigation({ router, routeState, flushSave, mobileSidebarOpen, editorRootEl })

const {
  searchOverlayOpen, searchSeed, pendingBlockTarget, pendingDrawUpdate, settingsSearchItems,
  workspaceSearchShortcut, runWorkspaceSearch, toggleSearch, onUpdateDraw, consumePendingDrawUpdate,
  consumePendingBlockTarget, handleTitleBarSearchSelect, openAiChatSource,
} = useWorkspaceSearchTargets({
  openNote,
  openFolder,
  openSettings,
  setPendingReveal,
  applyDrawUpdate: (payload) => {
    if (!editorPaneRef.value?.updateDrawBlock) return false
    editorPaneRef.value.updateDrawBlock(payload)
    return true
  },
})

const {
  templateCreatePickerOpen, createFolderModalOpen, createFolderTitle, createFolderError,
  obsidianImportOpen, obsidianImportFolderId, notionImportOpen, resolveNoteTitle, createNote,
  createNoteInFolder, createNotebook, handleTemplateCreate, closeTemplatePicker, createFolder,
  closeCreateFolderModal, submitCreateFolder, updateCreateFolderTitle, importMd, openObsidianImport,
  openNotionImport, importMdToFolder, importMdIntoNote,
} = useWorkspaceCreation({ router, activeNoteId, activeFolderId, flushSave, mobileSidebarOpen })

const { boardModal, createBoard, onBoardCreated, onBoardAction } = useWorkspaceBoardModal({ mobileSidebarOpen, openBoard })

const {
  pluginUiContributions, pluginUiReady, activePluginModal, activePluginView,
  updatePluginContributions, handlePluginFrameEvent,
} = useWorkspacePluginUi({
  route,
  routeState,
  dispatchPluginUiEvent: (pluginId, contributionId, event) =>
    editorPaneRef.value?.dispatchPluginUiEvent?.(pluginId, contributionId, event),
})
function openPluginItem(item: NevoSandboxSidebarItem) { openRoute(item.route) }

const {
  homeFavoritesManagerOpen, kanbanEnabled, boardsMeta, workspaceHome, homeFavoriteKeys,
  openHomeItem, toggleHomeFavorite,
} = useWorkspaceHomeShell({ pluginUiContributions, pluginUiReady, openNote, openRoute })
const containerOverview = useWorkspaceContainerOverview(activeNoteId, activeFolderId)

const {
  mobileNoteDetailsOpen, showMobileBottomNav, showMobileEditorHeader, hideWorkspaceTitlebar,
  mobileNoteFolderPath, navigateMobile, backFromMobileEditor, openMobileNoteDetails, deleteMobileNote,
  exportMobileNote, openMobileOutline, openGraphFromMobileDetails,
} = useWorkspaceMobileShell({
  router,
  routeState,
  runtime,
  isPhone,
  mobileSidebarOpen,
  searchOverlayOpen,
  isSettingsView,
  isArchiveView,
  leaveSystemView,
  layers: {
    homeFavoritesManagerOpen,
    boardModalOpen: toRef(boardModal, 'open'),
    templateCreatePickerOpen,
    createFolderModalOpen,
    obsidianImportOpen,
    notionImportOpen,
  },
  editorRootEl,
  routeForNote,
  changeNoteView,
  openGraph,
  flushSave,
  runWorkspaceSearch,
  deleteNote: note => { void onTreeAction({ action: 'delete', target: { kind: 'note', ...note } }) },
  exportNoteAsMarkdown: () => handleRequestExport('markdown'),
})

const { isDarkMode, workspaceRootStyle, workspaceRootClasses } = useWorkspaceAppearance({
  shellStyle, useDrawerNavigation, useFullscreenDialogs, isPhone, showMobileBottomNav,
})
const {
  sidebarTree, sidebarModeOverride, sidebarContentMode, sidebarLayout, floatingPinned,
  floatingRevealed, onEdgeEnter, onSidebarEnter, onSidebarLeave, toggleSidebarOrPin,
} = useWorkspaceSidebarLayout({ editorRootEl, useDrawerNavigation, isWorkspaceHome })

const rightPanelVisible = computed(() => rightPanelOpen.value && !isMobilePrimaryView.value && !isPhone.value && !isHistoryView.value && !isHistoryIndex.value && !isSettingsView.value && !isArchiveView.value)

const {
  renameModal, onTreeAction, handleRequestExport, submitRename, closeRenameModal,
  pdfPreview, closePdfPreview, docxPreview, closeDocxPreview, saveDocxWithOptions,
} = useWorkspaceTreeActions({ router, activeNoteId, activeFolderId, flushSave, closeNoteTab, openHistory, runWorkspaceSearch })

useWorkspaceKeymap(settings, {
  createNote,
  createFolder,
  saveNote: flushSave,
  runSearch: () => toggleSearch(),
  toggleSidebar: () => toggleSidebarOrPin(),
  toggleRightPanel: () => uiStore.toggleRightPanel(),
  openGraph: () => openGraph(),
  openHistory: () => toggleHistory(),
  openTrash: () => toggleTrash(),
  openSettings: () => toggleSettings(),
  findInNote: () => { editorPaneRef.value?.openFindInNote?.(false) },
  replaceInNote: () => { editorPaneRef.value?.openFindInNote?.(true) },
  toggleDictation: () => { editorPaneRef.value?.toggleDictation?.() },
  toggleAiChat: () => { if (settings.value.ai.enabled && !isSettingsView.value) aiChatStore.toggle() },
})

useWorkspaceLifecycleWatchers({
  router, route, routeState, isPhone, useDrawerNavigation, mobileSidebarOpen, mobileNoteDetailsOpen,
  kanbanEnabled, boardsMeta,
})
const {
  historyRouteReady, noteLoadError, updateTitle, updateIcon, updateCover, updateContent,
  updateCanvas, updateNotebook, markContentDirty, renameNoteFromAgent,
} = useWorkspaceNoteSession({ router, route, routeState, flushSave, routeForNote, reportHistorySaveFailure })
</script>

<template>
  <div class="nv-app workspace-root tw:flex tw:flex-col tw:isolate" :class="workspaceRootClasses" :style="workspaceRootStyle">
    <div class="nv-canvas" />
    <ProductTourOverlay :is-mobile-layout="isPhone" />
    <FirstUseHintPopover :is-mobile-layout="isPhone" />

    <header
      v-if="!hideWorkspaceTitlebar"
      class="workspace-titlebar tw:grid tw:grid-cols-[minmax(0,1fr)_minmax(220px,340px)_minmax(0,1fr)] tw:items-center tw:gap-3 tw:relative tw:z-[4] tw:bg-(--frame-bg) tw:border-b-0"
      :class="{ 'workspace-titlebar--compact-layout': useCompactHeader, 'workspace-titlebar--drag tw:[-webkit-app-region:drag]': runtime.supportsWindowDragRegions }"
    >
      <div class="titlebar-start tw:flex tw:items-center tw:gap-2 tw:min-w-0">
        <div class="titlebar-leading tw:flex tw:items-center tw:gap-2 tw:flex-none tw:[-webkit-app-region:no-drag]">
          <button v-if="useDrawerNavigation" type="button" class="nv-btn workspace-drawer-toggle tw:min-w-7 tw:px-2 tw:[-webkit-app-region:no-drag] tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]" :aria-label="t('workspace.openDrawer')" @click="mobileSidebarOpen = true"><Menu :size="15" /></button>
          <button v-if="!useDrawerNavigation" type="button" class="nv-btn workspace-sidebar-toggle tw:min-w-7 tw:px-2 tw:opacity-70 tw:transition-opacity tw:duration-150 tw:hover:opacity-100 tw:[-webkit-app-region:no-drag] tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]" :aria-label="t('workspace.toggleSidebar')" :class="{ 'workspace-sidebar-toggle--collapsed': sidebarLayout === 'floating' ? !floatingPinned : !sidebarOpen }" @click="toggleSidebarOrPin()"><PanelLeft :size="15" /></button>
        </div>
        <TitleBarTabs :tabs="tabs" :active-tab-id="activeTabId" @select="openNote" @close="closeTab" @reorder="(from, to) => tabsStore.moveTab(from, to)" />
      </div>
      <TitleBarSearch :search-shortcut="workspaceSearchShortcut" @open="runWorkspaceSearch()" />
      <div class="titlebar-trailing tw:flex tw:items-center tw:justify-self-end tw:gap-2 tw:min-w-0">
        <div v-if="useCompactHeader && !runtime.isMobileRuntime" class="titlebar-actions tw:flex tw:items-center tw:gap-1.5 tw:flex-none tw:[-webkit-app-region:no-drag]">
          <button type="button" class="nv-btn titlebar-action-btn tw:min-w-7 tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]" :title="t('workspace.system.history')" @click="openHistory()"><History :size="13" /><span class="titlebar-action-label">{{ t('workspace.system.history') }}</span></button>
          <button type="button" class="nv-btn titlebar-action-btn tw:min-w-7 tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]" :title="t('workspace.system.settings')" @click="openSettings()"><Settings2 :size="13" /><span class="titlebar-action-label">{{ t('workspace.system.settings') }}</span></button>
        </div>
        <WindowControls v-if="runtime.supportsWindowControls" />
      </div>
    </header>

    <MobileEditorHeader
      v-if="showMobileEditorHeader && activeNote"
      :mode="noteViewMode"
      :context="mobileNoteFolderPath"
      :title="activeNote.title || t('workspace.untitledNote')"
      :show-view-switcher="!isNotebookNote"
      :show-export="!isNotebookNote"
      @back="backFromMobileEditor"
      @export="exportMobileNote"
      @details="openMobileNoteDetails"
      @delete="deleteMobileNote"
      @change-mode="changeNoteView"
    />

    <div
      class="workspace-body tw:relative tw:z-[1]"
      :class="{
        'workspace-body--drawer': useDrawerNavigation,
        'workspace-body--inset-left': !useDrawerNavigation && (sidebarLayout === 'floating' || !sidebarOpen),
      }"
    >
      <div
        v-if="!useDrawerNavigation"
        class="workspace-sidebar-shell workspace-sidebar-shell--desktop"
        :class="{
          'workspace-sidebar-shell--hidden': !sidebarOpen && sidebarLayout === 'docked',
          'workspace-sidebar-shell--tag-preview': sidebarContentMode === 'tag-preview',
          'workspace-sidebar-shell--floating': sidebarLayout === 'floating',
          'workspace-sidebar-shell--revealed': floatingRevealed,
        }"
        @mouseenter="onSidebarEnter"
        @mouseleave="onSidebarLeave"
      >
        <WorkspaceSidebar
          :workspace-name="manifest?.name ?? t('workspace.noWorkspace')"
          :workspace-glyph="manifest?.glyph ?? 'N'"
          :tree="sidebarTree"
          :active-note-id="isHistoryView || isHistoryIndex ? null : activeNoteId"
          :active-folder-id="activeFolderId"
          :boards="boardsMeta"
          :active-board-id="activeBoardId"
          :kanban-enabled="kanbanEnabled"
          :backend-kind="workspaceStore.backendKind"
          :sidebar-mode="sidebarContentMode"
          :note-previews="workspaceStore.sidebarNotePreviews"
          :plugin-items="pluginUiContributions.sidebarItems"
          :home-favorite-keys="homeFavoriteKeys"
          @preview-tags="sidebarModeOverride = 'tag-preview'"
          @create-note="createNote"
          @create-notebook="createNotebook"
          @create-note-in-folder="createNoteInFolder"
          @create-folder="createFolder"
          @import-md="importMd"
          @import-obsidian="openObsidianImport"
          @import-notion="openNotionImport"
          @import-into-folder="importMdToFolder"
          @import-into-note="importMdIntoNote"
          @open-note="openNote"
          @open-folder="openFolder"
          @tree-action="onTreeAction"
          @open-history="openHistory()"
          @open-trash="openTrash"
          @open-settings="openSettings"
          @open-graph="openGraph"
          @open-board="openBoard"
          @open-plugin-item="openPluginItem"
          @open-home="openWorkspaceHome"
          @toggle-home="toggleHomeFavorite"
          @create-board="createBoard"
          @board-action="onBoardAction"
          @back-to-onboarding="backToOnboarding"
        />
      </div>
      <div v-if="!useDrawerNavigation && sidebarLayout === 'floating'" class="workspace-sidebar-edge-trigger tw:absolute tw:left-0 tw:top-0 tw:bottom-0 tw:w-[14px] tw:z-[15]" @mouseenter="onEdgeEnter" @mouseleave="onSidebarLeave" />
      <MobileNoteDetailsView
        v-if="mobileNoteDetailsOpen && activeNote"
        :note="activeNote"
        :folder-path="mobileNoteFolderPath"
        @close="mobileNoteDetailsOpen = false"
        @export="exportMobileNote"
        @open-outline="openMobileOutline"
        @open-graph="openGraphFromMobileDetails"
      />
      <MobileLibraryView
        v-else-if="isMobileLibraryView"
        :workspace-name="manifest?.name ?? t('workspace.noWorkspace')"
        :root-notes="manifest?.rootNotes ?? []"
        :folders="manifest?.tree ?? []"
        :previews="workspaceStore.sidebarNotePreviews"
        @create-note="createNote"
        @create-notebook="createNotebook"
        @open-note="openNote"
        @open-folder="openFolder"
        @open-search="runWorkspaceSearch()"
      />
      <MobileBoardsView
        v-else-if="isMobileBoardsView"
        :workspace-name="manifest?.name ?? t('workspace.noWorkspace')"
        :boards="boardsMeta"
        :enabled="kanbanEnabled"
        @create="createBoard"
        @open="openBoard"
        @board-action="onBoardAction"
      />
      <MobileMoreView
        v-else-if="isMobileMoreView"
        :workspace-name="manifest?.name ?? t('workspace.noWorkspace')"
        :workspace-glyph="manifest?.glyph ?? 'N'"
        :backend-kind="workspaceStore.backendKind"
        @graph="openGraph"
        @history="openHistory()"
        @trash="openTrash"
        @settings="openSettings()"
        @import="importMd"
        @leave="backToOnboarding"
      />
      <WorkspaceHome
        v-else-if="isWorkspaceHome"
        :workspace-name="manifest?.name ?? t('workspace.noWorkspace')"
        :search-shortcut="workspaceSearchShortcut"
        :favorite-items="workspaceHome.favoriteItems.value"
        :recent-items="workspaceHome.recentItems.value"
        :kanban-enabled="kanbanEnabled"
        :is-workspace-empty="workspaceHome.isWorkspaceEmpty.value"
        :backend-kind="workspaceStore.backendKind"
        :note-count="workspaceStore.noteCount"
        :workspace-bytes="diagnostics?.workspaceBytes"
        :starter-note-id="onboardingStore.starterNoteId"
        :first-steps-visible="onboardingStore.firstStepsVisible"
        :first-steps-completed="onboardingStore.completedFirstSteps"
        @search="runWorkspaceSearch"
        @create-note="createNote"
        @create-folder="createFolder"
        @import-md="importMd"
        @import-obsidian="openObsidianImport"
        @import-notion="openNotionImport"
        @create-board="createBoard"
        @open-item="openHomeItem"
        @manage-favorites="homeFavoritesManagerOpen = true"
        @hide-first-steps="onboardingStore.setFirstStepsHidden(true)"
        @take-tour="onboardingStore.startTour()"
      />
      <GraphView v-else-if="isGraphView" :workspace-path="workspaceStore.activePath" :manifest="manifest" :active-note-id="activeNoteId" @open-note="openNote" @back="() => router.push(isPhone ? '/workspace/more' : '/workspace')" />
      <KanbanView v-else-if="kanbanEnabled && isKanbanView && routeBoardId" :board-id="routeBoardId" @back="() => router.push('/workspace')" />
      <DrawView v-else-if="isDrawView && routeDrawId && activeNoteId" :workspace-path="workspaceStore.activePath" :note-id="activeNoteId" :draw-id="routeDrawId ? routeDrawId : ''" :is-dark="isDarkMode" @open-note="openNote" @update-draw="onUpdateDraw" @back="() => activeNoteId && openNote(activeNoteId)" />
      <HistoryNotePicker v-else-if="isHistoryIndex" @back="() => router.push('/workspace')" @select="(noteId) => router.push(`/workspace/note/${noteId}/history`)" />
      <div v-else-if="isHistoryView && !historyRouteReady" role="status" class="tw:m-auto tw:p-8 tw:text-sm tw:text-content-muted">{{ t('workspace.history.timeline.loading') }}</div>
      <HistoryView v-else-if="isHistoryView && activeNoteId" :note-id="activeNoteId" @open-note="openNote" @back="() => router.push('/workspace/history')" />
      <WorkspaceSettingsView v-else-if="isSettingsView" :section="settingsSection" @back="leaveSystemView" />
      <WorkspaceArchiveView v-else-if="isArchiveView" @back="leaveSystemView" />
      <section
        v-else-if="isSandboxPluginRoute"
        class="sandbox-plugin-view"
        :aria-label="activePluginView?.title ?? t(pluginUiReady ? 'workspace.pluginUi.unavailable' : 'workspace.pluginUi.loading')"
      >
        <SandboxPluginFrame
          v-if="activePluginView"
          :src="activePluginView.frame.source"
          :plugin-id="activePluginView.pluginId"
          :locale="String(locale)"
          :theme="isDarkMode ? 'dark' : 'light'"
          :supported="!runtime.isMobileRuntime"
          :unsupported-label="t('workspace.pluginUi.unsupportedMobile')"
          @event="handlePluginFrameEvent(activePluginView, $event)"
        />
        <div v-else class="sandbox-plugin-view__status" role="status">
          {{ t(pluginUiReady ? 'workspace.pluginUi.unavailable' : 'workspace.pluginUi.loading') }}
        </div>
      </section>
      <div
        v-if="isSandboxPluginRoute || (!isGraphView && !isKanbanView && !isDrawView && !isHistoryView && !isHistoryIndex && !isSettingsView && !isArchiveView)"
        v-show="!isSandboxPluginRoute && !isMobilePrimaryView && !mobileNoteDetailsOpen"
        class="workspace-editor-pane-shell"
      >
        <WorkspaceNoteHost
          :key="workspaceNoteHostKey"
          ref="editorPaneRef"
          :note="activeNote"
          :note-id="activeNoteId"
          :load-error="noteLoadError"
          :format-result="activeNoteFormat"
          :workspace-path="workspaceStore.activePath"
          :workspace-name="manifest?.name ?? ''"
          :plugin-manifests="workspaceStore.plugins"
          :settings="settings"
          :save-status="saveStatus"
          :container-title="containerOverview.title"
          :container-kind="containerOverview.kind"
          :container-items="containerOverview.items"
          :pending-block-target="pendingBlockTarget"
          :pending-draw-update="pendingDrawUpdate"
          :workspace-id="manifest?.id ?? ''"
          :view-mode="noteViewMode"
          @update:title="updateTitle"
          @update:icon="updateIcon"
          @update:cover="updateCover"
          @update:content="updateContent"
          @update:canvas="updateCanvas"
          @update:notebook="updateNotebook"
          @change-view="changeNoteView"
          @content-dirty="markContentDirty"
          @create-note="createNote"
          @consumed-pending-target="consumePendingBlockTarget"
          @consumed-draw-update="consumePendingDrawUpdate"
          @open-note="openNote"
          @open-folder="openFolder"
          @request-export="handleRequestExport"
          @request-import-md="() => activeNoteId && importMdIntoNote(activeNoteId)"
          @open-draw="openDraw"
          @plugin-contributions="updatePluginContributions"
        />
      </div>
      <div class="workspace-right-panel-shell" :class="{ 'workspace-right-panel-shell--hidden': !rightPanelOpen || isMobilePrimaryView || isPhone || isHistoryView || isHistoryIndex || isSettingsView || isArchiveView }">
        <WorkspaceRightPanel
          v-if="rightPanelOpen && !isMobilePrimaryView && !isPhone && !isHistoryView && !isHistoryIndex && !isSettingsView && !isArchiveView"
          :note="activeNote"
          :editor-root-el="editorRootEl"
          @close="uiStore.toggleRightPanel()"
          @open-note="openNote"
          @open-graph="openGraph"
        />
      </div>
      <AiChatHost
        :active-note-id="activeNoteId"
        :right-panel-visible="rightPanelVisible"
        :bottom-nav-visible="showMobileBottomNav"
        :suppressed="isSettingsView"
        @open-note="openNote"
        @open-source="openAiChatSource"
        @open-settings="openSettings('ai')"
      />
    </div>
    <MobileBottomNav
      v-if="showMobileBottomNav"
      :active="mobileActiveTab"
      @navigate="navigateMobile"
    />
  </div>

  <WorkspaceDrawer
    :open="useDrawerNavigation && mobileSidebarOpen"
    @close="mobileSidebarOpen = false"
    @back="backToOnboarding"
  >
    <WorkspaceSidebar
      :workspace-name="manifest?.name ?? t('workspace.noWorkspace')"
      :workspace-glyph="manifest?.glyph ?? 'N'"
      :tree="sidebarTree"
      :active-note-id="isHistoryView || isHistoryIndex ? null : activeNoteId"
      :active-folder-id="activeFolderId"
      :boards="boardsMeta"
      :active-board-id="activeBoardId"
      :kanban-enabled="kanbanEnabled"
      :backend-kind="workspaceStore.backendKind"
      :sidebar-mode="sidebarContentMode"
      :note-previews="workspaceStore.sidebarNotePreviews"
      :plugin-items="pluginUiContributions.sidebarItems"
      :home-favorite-keys="homeFavoriteKeys"
      @preview-tags="sidebarModeOverride = 'tag-preview'"
      @create-note="createNote"
      @create-notebook="createNotebook"
      @create-note-in-folder="createNoteInFolder"
      @create-folder="createFolder"
      @import-md="importMd"
      @import-obsidian="openObsidianImport"
      @import-notion="openNotionImport"
      @import-into-folder="importMdToFolder"
      @import-into-note="importMdIntoNote"
      @open-note="openNote"
      @open-folder="openFolder"
      @tree-action="onTreeAction"
      @open-history="openHistory()"
      @open-trash="openTrash"
      @open-settings="openSettings"
      @open-graph="openGraph"
      @open-board="openBoard"
      @open-plugin-item="openPluginItem"
      @open-home="openWorkspaceHome"
      @toggle-home="toggleHomeFavorite"
      @create-board="createBoard"
      @board-action="onBoardAction"
      @back-to-onboarding="backToOnboarding"
    />
  </WorkspaceDrawer>

  <WorkspaceSearchOverlay
    :open="searchOverlayOpen"
    :seed="searchSeed"
    :manifest="manifest"
    :workspace-path="workspaceStore.activePath"
    :settings-items="settingsSearchItems"
    @close="searchOverlayOpen = false"
    @select-result="handleTitleBarSearchSelect"
  />

  <WorkspaceHomeFavoritesManager
    :open="homeFavoritesManagerOpen"
    :items="workspaceHome.managerItems.value"
    :candidates="workspaceHome.candidates.value"
    @close="homeFavoritesManagerOpen = false"
    @add="workspaceHome.addFavorite($event.favorite)"
    @remove="workspaceHome.removeFavorite($event.favorite)"
    @move="workspaceHome.moveFavorite"
  />
  <PdfPreviewModal v-if="pdfPreview.open && pdfPreview.note" :note="pdfPreview.note" :workspace-path="pdfPreview.workspacePath" :asset-bytes="pdfPreview.assetBytes" @close="closePdfPreview" />
  <DocxPreviewModal v-if="docxPreview.open && docxPreview.note" :note="docxPreview.note" :workspace-path="docxPreview.workspacePath" @close="closeDocxPreview" @save="(opts) => { void saveDocxWithOptions(docxPreview.note!, docxPreview.workspacePath, opts); closeDocxPreview() }" />
  <TemplatePickerModal
    v-if="templateCreatePickerOpen"
    :open="templateCreatePickerOpen"
    mode="create-note"
    :workspace-path="workspaceStore.activePath"
    :workspace-name="manifest?.name ?? ''"
    :default-template-id="settings.workspace.newNoteTemplate"
    :note-title="resolveNoteTitle()"
    @close="closeTemplatePicker"
    @use="handleTemplateCreate"
  />

  <KanbanBoardModal
    v-if="boardModal.open"
    :mode="boardModal.mode"
    :board-id="boardModal.boardId"
    :initial-title="boardModal.boardTitle"
    :initial-icon="boardModal.boardIcon"
    @close="boardModal.open = false"
    @created="onBoardCreated"
    @renamed="boardModal.open = false"
    @deleted="boardModal.open = false"
  />

  <WorkspaceRenameModal
    :open="renameModal.open"
    :title="renameModal.title"
    :heading="t('workspace.context.renameModalTitle')"
    @update:title="renameModal.title = $event"
    @submit="submitRename"
    @close="closeRenameModal"
  />

  <WorkspaceRenameModal
    :open="createFolderModalOpen"
    :title="createFolderTitle"
    :heading="t('workspace.createFolderModal.title')"
    :description="t('workspace.createFolderModal.description')"
    :input-label="t('workspace.createFolderModal.placeholder')"
    :placeholder="t('workspace.createFolderModal.placeholder')"
    :submit-label="t('workspace.createFolderModal.submit')"
    :error="createFolderError"
    :submit-disabled="!createFolderTitle.trim()"
    variant="folder"
    @update:title="updateCreateFolderTitle"
    @submit="submitCreateFolder"
    @close="closeCreateFolderModal"
  />

  <ObsidianImportModal
    v-if="obsidianImportOpen"
    :open="obsidianImportOpen"
    :target-folder-id="obsidianImportFolderId"
    @close="obsidianImportOpen = false"
  />

  <NotionImportModal
    v-if="notionImportOpen"
    :open="notionImportOpen"
    @close="notionImportOpen = false"
  />

  <WorkspacePluginModal
    v-if="activePluginModal"
    :modal="activePluginModal"
    :is-dark="isDarkMode"
    :supported="!runtime.isMobileRuntime"
    @close="activePluginModal = null"
    @event="handlePluginFrameEvent(activePluginModal, $event)"
  />

  <UpdateDialog />
</template>

<style scoped>
.sandbox-plugin-view {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
}

.sandbox-plugin-view__status {
  display: grid;
  height: 100%;
  place-items: center;
  color: var(--text-muted);
}
</style>
