<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, History, Menu, PanelLeft, Settings2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import WindowControls from '../ui/primitives/WindowControls.vue'
import WorkspaceRightPanel from './components/WorkspaceRightPanel.vue'
import WorkspaceSidebar from './components/WorkspaceSidebar.vue'
import WorkspaceHome from './components/WorkspaceHome.vue'
import WorkspaceHomeFavoritesManager from './components/WorkspaceHomeFavoritesManager.vue'
import MobileBoardsView from './components/mobile/MobileBoardsView.vue'
import MobileBottomNav, { type MobileWorkspaceTab } from './components/mobile/MobileBottomNav.vue'
import MobileEditorHeader from './components/mobile/MobileEditorHeader.vue'
import MobileLibraryView from './components/mobile/MobileLibraryView.vue'
import MobileMoreView from './components/mobile/MobileMoreView.vue'
import MobileNoteDetailsView from './components/mobile/MobileNoteDetailsView.vue'
import SandboxPluginFrame from './components/plugins/SandboxPluginFrame.vue'
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
import { useToast } from '../ui/composables/useToast'
import TitleBarTabs from './components/TitleBarTabs.vue'
const GraphView = defineAsyncComponent(() => import('../features/graph/GraphView.vue'))
const KanbanView = defineAsyncComponent(() => import('../features/databases/kanban/KanbanView.vue'))
const KanbanBoardModal = defineAsyncComponent(() => import('../features/databases/kanban/KanbanBoardModal.vue'))
const DrawView = defineAsyncComponent(() => import('../features/draw/DrawView.vue'))
const HistoryView = defineAsyncComponent(() => import('../features/history/HistoryView.vue'))
const HistoryNotePicker = defineAsyncComponent(() => import('../features/history/HistoryNotePicker.vue'))
import { useUiStore } from '../stores/ui'
import { useKanbanStore } from '../stores/kanban'
import { useWorkspaceStore } from '../stores/workspace'
import { useTreeStore } from '../stores/tree'
import { useNoteStore } from '../stores/note'
import { useTabsStore } from '../stores/tabs'
import { useThemeStore } from '../stores/theme'
import { useOnboardingStore } from '../stores/onboarding'
import { useNotePersistence } from '../composables/useNotePersistence'
import { useWorkspaceKeymap } from './composables/useWorkspaceKeymap'
import { useTreeContextMenu } from './composables/useTreeContextMenu'
import { isSystemPath } from './routing/systemRoutes'
import { useSystemViews } from './composables/useSystemViews'
import type { FolderMeta, NoteDocument, TreeNode } from '../types/note'
import type { NotebookSnapshotV1 } from '../core/notebook/types'
import type { TemplateDocument, TemplateFieldValues } from '../types/template'
import type { SidebarContentMode, WorkspaceHomeFavorite } from '../types/workspace'
import type {
  NevoSandboxModal,
  NevoSandboxSidebarItem,
  NevoSandboxUiContributionSnapshot,
  NevoSandboxWorkspaceView,
} from '../types/editor-plugin'
import type { TitleBarSearchResult, WorkspaceBlockNavigationTarget } from '../types/search'
import { ACCENT_PRESETS, resolveBindingChord } from '../utils/workspace-settings'
import { isPluginEnabled } from '../utils/system-plugins'
import { resolveStartupTarget } from '../utils/workspace-startup'
import { buildWorkspaceSettingsSearchItems } from './search/settings'
import { useNoteExport } from '../composables/useNoteExport'
import { useMarkdownImport } from '../composables/useMarkdownImport'
import { useDeviceLayout } from '../composables/useDeviceLayout'
import { useMobileBackButton } from '../composables/useMobileBackButton'
import { useFloatingSidebar } from './composables/useFloatingSidebar'
import { useWorkspaceHome, type WorkspaceHomeItem } from './composables/useWorkspaceHome'
import { useAppUpdater } from '../composables/useAppUpdater'
import { useMcpBridge } from './composables/useMcpBridge'
import { useMcpBridgeHost } from './composables/useMcpBridgeHost'
import { useNotebookCreation } from './composables/useNotebookCreation'
import { createEditorLayoutScrollStabilizer } from './composables/editor/editorLayoutScrollStabilizer'
import { workspaceHomeFavoriteKey } from '../utils/workspace-settings'
import { finalizeActiveRecording } from '../core/voice-recording/activeRecording'
import {
  readRememberedNoteView,
  rememberNoteView,
  type NoteViewMode,
} from '../features/canvas/canvasPreferences'

const router = useRouter()
const route = useRoute()
const { t, locale } = useI18n()
const { showToast } = useToast()

const uiStore = useUiStore()
const { sidebarOpen, rightPanelOpen } = storeToRefs(uiStore)
const workspaceStore = useWorkspaceStore()
const treeStore = useTreeStore()
const noteStore = useNoteStore()
const themeStore = useThemeStore()
const onboardingStore = useOnboardingStore()
const {
  exportAsMarkdown,
  exportAsHtml,
  exportAsDocx,
  exportAsTypst,
  exportAsPdf,
  pdfPreview,
  closePdfPreview,
  docxPreview,
  closeDocxPreview,
  saveDocxWithOptions,
} = useNoteExport()
const { importMarkdownFile, importMarkdownIntoNote } = useMarkdownImport()

// Starts or stops the local MCP bridge to match the workspace's access mode,
// and serves the requests it can only answer from the webview.
useMcpBridge()
useMcpBridgeHost()

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

const { manifest, settings, appConfig, plugins, diagnostics } = storeToRefs(workspaceStore)
const { tree, folderById } = storeToRefs(treeStore)
const { activeNote, saveStatus } = storeToRefs(noteStore)
const tabsStore = useTabsStore()
const { tabs, activeTabId } = storeToRefs(tabsStore)
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
} | null>(null)
const editorRootEl = computed(() => editorPaneRef.value?.editorRoot ?? null)
const workspaceNoteHostKey = computed(() => `${workspaceStore.backendKind ?? 'none'}:${workspaceStore.activePath ?? ''}:${activeNoteId.value ?? 'empty'}`)
const isNotebookNote = computed(() => activeNote.value?.documentKind === 'notebook')
const activeNoteFormat = computed(() => noteStore.getActiveNoteFormat(activeNoteId.value ?? undefined))
const { flushSave } = useNotePersistence()
const notebookCreation = useNotebookCreation(openCreatedNote)
const renameInputRef = ref<HTMLInputElement | null>(null)
const searchOverlayOpen = ref(false)
const searchSeed = ref('')
const mobileSidebarOpen = ref(false)
const mobileNoteDetailsOpen = ref(false)
const homeFavoritesManagerOpen = ref(false)
const boardModal = reactive<{
  open: boolean
  mode: 'create' | 'rename' | 'delete'
  boardId?: string
  boardTitle?: string
  boardIcon?: string
}>({ open: false, mode: 'create' })
const restoredRouteForWorkspace = ref<string | null>(null)
const pendingBlockTarget = ref<WorkspaceBlockNavigationTarget | null>(null)
type DrawUpdatePayload = { drawId: string; svgPreview: string; src: string; title?: string }
const pendingDrawUpdate = ref<DrawUpdatePayload | null>(null)
const templateCreatePickerOpen = ref(false)
const templateCreateFolderId = ref<string | null>(null)
const createFolderModalOpen = ref(false)
const obsidianImportOpen = ref(false)
const obsidianImportFolderId = ref<string | null>(null)
const notionImportOpen = ref(false)
const createFolderTitle = ref('')
const createFolderError = ref('')
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

const workspaceBackEnabled = computed(() =>
  runtime.value.isMobileRuntime
  && isPhone.value
  && !searchOverlayOpen.value
  && !isSettingsView.value
  && (
    mobileSidebarOpen.value
    || mobileNoteDetailsOpen.value
    || isArchiveView.value
    || homeFavoritesManagerOpen.value
    || boardModal.open
    || templateCreatePickerOpen.value
    || createFolderModalOpen.value
    || obsidianImportOpen.value
    || notionImportOpen.value
    || route.path !== '/workspace'
  ),
)

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
  if (homeFavoritesManagerOpen.value) {
    homeFavoritesManagerOpen.value = false
    return
  }
  if (boardModal.open) {
    boardModal.open = false
    return
  }
  if (templateCreatePickerOpen.value) {
    templateCreatePickerOpen.value = false
    return
  }
  if (createFolderModalOpen.value) {
    createFolderModalOpen.value = false
    return
  }
  if (obsidianImportOpen.value) {
    obsidianImportOpen.value = false
    return
  }
  if (notionImportOpen.value) {
    notionImportOpen.value = false
    return
  }
  if (isDrawView.value && activeNoteId.value) {
    await router.push(routeForNote(activeNoteId.value))
    return
  }
  if (isHistoryIndex.value) {
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
  await router.push('/workspace')
}

useMobileBackButton(handleMobileBack, workspaceBackEnabled)
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
const historyRouteReady = ref(true)
const noteViewMode = computed<NoteViewMode>(() => isCanvasView.value ? 'canvas' : 'document')
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
const routePluginId = computed(() => route.params.pluginId ? String(route.params.pluginId) : null)
const routePluginViewId = computed(() => route.params.viewId ? String(route.params.viewId) : null)
const isSandboxPluginRoute = computed(() => routePluginId.value !== null)
const pluginUiContributions = ref<NevoSandboxUiContributionSnapshot>({
  workspaceViews: [],
  sidebarItems: [],
  modals: [],
})
const pluginUiReady = ref(false)
const activePluginModal = ref<NevoSandboxModal | null>(null)
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
// Dark-mode detection for the draw canvas background. The theme store applies
// a `theme-dark` class to <html>; we mirror it reactively.
const isDarkMode = computed(() => {
  void themeStore.theme
  return typeof document !== 'undefined' && document.documentElement.classList.contains('theme-dark')
})

const kanbanStore = useKanbanStore()
const { activeBoardId: activeBoardId } = storeToRefs(kanbanStore)

const workspaceRootStyle = computed(() => {
  const val = settings.value.appearance.accentPreset
  const accent = ACCENT_PRESETS[val]
  if (accent) {
    return {
      '--accent': accent.accent,
      '--accent-soft': accent.soft,
      '--selection': `color-mix(in oklab, ${accent.accent} 25%, transparent)`,
      ...shellStyle.value,
    }
  }
  return {
    '--accent': val,
    '--accent-soft': `color-mix(in oklab, ${val} 14%, transparent)`,
    '--selection': `color-mix(in oklab, ${val} 25%, transparent)`,
    ...shellStyle.value,
  }
})
const workspaceRootClasses = computed(() => ({
  'workspace-root--compact': appConfig.value.interfaceDensity === 'compact',
  'workspace-root--drawer': useDrawerNavigation.value,
  'workspace-root--phone': isPhone.value,
  'workspace-root--mobile-primary': showMobileBottomNav.value,
  'workspace-root--fullscreen-dialogs': useFullscreenDialogs.value,
  'workspace-root--reduced-motion': appConfig.value.reducedMotion === 'reduce',
}))
const settingsSearchItems = computed(() => buildWorkspaceSettingsSearchItems({ t, manifest: manifest.value, settings: settings.value, appConfig: appConfig.value, plugins: plugins.value, pluginValidation: {}, locale: appConfig.value.locale, themeMode: themeStore.theme }))
const workspaceSearchShortcut = computed(() => { const b = settings.value.hotkeys.bindings.find(x => x.commandId === 'workspace.search'); return b ? resolveBindingChord(b) : 'Ctrl+P' })
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
const kanbanEnabled = computed(() => isPluginEnabled(plugins.value, 'nevo.kanban'))
const templatesEnabled = computed(() => isPluginEnabled(plugins.value, 'nevo.templates'))
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
})
const homeFavoriteKeys = computed(() =>
  settings.value.general.homeFavorites.map(workspaceHomeFavoriteKey),
)

function buildRootOverviewItems(): TreeNode[] {
  const workspace = manifest.value; if (!workspace) return []
  const items: TreeNode[] = []
  for (const id of workspace.rootOrder) {
    const folder = workspace.tree.find(e => e.id === id)
    if (folder) { items.push({ kind: 'folder', meta: folder }); continue }
    const note = workspace.rootNotes.find(e => e.id === id)
    if (note) items.push({ kind: 'note', meta: note })
  }
  return items
}

const containerOverview = computed(() => {
  if (activeNoteId.value || !manifest.value) return { title: null as string | null, kind: null as 'root' | 'folder' | null, items: [] as TreeNode[] }
  if (activeFolderId.value) {
    const folder = folderById.value.get(activeFolderId.value) ?? null
    if (!folder) return { title: null, kind: null, items: [] }
    const items: TreeNode[] = [...folder.children.map((c: FolderMeta) => ({ kind: 'folder' as const, meta: c })), ...folder.notes.map(n => ({ kind: 'note' as const, meta: n }))]
    return { title: folder.title, kind: 'folder' as const, items }
  }
  return { title: manifest.value.name, kind: 'root' as const, items: buildRootOverviewItems() }
})

async function runWorkspaceSearch(seed = '') { searchSeed.value = seed; searchOverlayOpen.value = true }
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
function toggleSearch() { if (searchOverlayOpen.value) { searchOverlayOpen.value = false } else { void runWorkspaceSearch() } }
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
  if (!noteId || !workspaceId || isNotebookNote.value || noteViewMode.value === mode) return
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
function exportMobileNote() {
  handleRequestExport('markdown')
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
function openPluginItem(item: NevoSandboxSidebarItem) {
  mobileSidebarOpen.value = false
  flushSave()
  void router.push(item.route)
}
function openHomeItem(item: WorkspaceHomeItem) {
  if (!item.available || !item.route) return
  if (item.kind === 'note' && item.favorite.kind === 'note') {
    openNote(item.favorite.id)
    return
  }
  mobileSidebarOpen.value = false
  flushSave()
  void router.push(item.route)
}
async function toggleHomeFavorite(favorite: WorkspaceHomeFavorite) {
  const result = await workspaceHome.toggleFavorite(favorite)
  if (result === 'limit') homeFavoritesManagerOpen.value = true
}
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
  await editorPaneRef.value?.dispatchPluginUiEvent?.(
    contribution.pluginId,
    contribution.id,
    event,
  )
}

// Open the full-canvas drawing editor for a draw_block. The noteId is the
// parent note (so save-target stays valid); drawId identifies the block.
function openDraw(noteId: string, drawId: string) {
  mobileSidebarOpen.value = false
  if (isDrawView.value && routeDrawId.value === drawId && activeNoteId.value === noteId) return
  flushSave()
  router.push(`/workspace/draw/${noteId}/${drawId}`)
}

// Sync preview/src back into the draw_block node after the canvas saved.
//
// When the note editor is mounted, it holds the live ProseMirror doc, so the
// update MUST go through a transaction (updateDrawBlock) rather than patching
// `note.content` directly — a direct patch would be invisible to the editor
// and get clobbered the next time it serializes its own doc. When the editor
// pane is unmounted (the canvas is open full-screen instead), `note.content`
// itself is the source of truth and useDrawNoteSync patches it directly; this
// pendingDrawUpdate path only covers the pane's own remount.
//
// Stash the update and let the pane apply it when it remounts — same
// approach as pendingBlockTarget.
function onUpdateDraw(payload: DrawUpdatePayload) {
  if (editorPaneRef.value?.updateDrawBlock) {
    editorPaneRef.value.updateDrawBlock(payload)
  } else {
    pendingDrawUpdate.value = payload
  }
}
function consumePendingDrawUpdate() { pendingDrawUpdate.value = null }
function createBoard() {
  mobileSidebarOpen.value = false
  boardModal.mode = 'create'
  boardModal.boardId = undefined
  boardModal.open = true
}
function onBoardCreated(boardId: string) {
  boardModal.open = false
  openBoard(boardId)
}
function onBoardAction(payload: { action: 'rename' | 'delete'; boardId: string; boardTitle: string; boardIcon: string }) {
  boardModal.mode = payload.action
  boardModal.boardId = payload.boardId
  boardModal.boardTitle = payload.boardTitle
  boardModal.boardIcon = payload.boardIcon
  boardModal.open = true
}
function backToOnboarding() { mobileSidebarOpen.value = false; flushSave(); router.push('/onboarding') }
function resolveNoteTitle(): string {
  const pattern = settings.value.workspace.defaultNoteTitlePattern
  if (pattern === 'date') return new Date().toISOString().slice(0, 10)
  if (pattern === 'date-time') return new Date().toISOString().slice(0, 16).replace('T', ' ')
  return t('workspace.untitledNote')
}

function resolveNotePlacementFolder(): string | null {
  return settings.value.workspace.newNotePlacement === 'root' ? null : activeFolderId.value
}

function resolveFolderPlacementFolder(): string | null {
  return settings.value.workspace.newFolderPlacement === 'root' ? null : activeFolderId.value
}

async function openCreatedNote(note: NoteDocument | null) {
  if (note) {
    tabsStore.openTab(note.id, note.title, note.icon)
    await router.push(`/workspace/note/${note.id}`)
  }
}

async function createPlainNote(folderId: string | null) {
  const icon = settings.value.workspace.defaultNoteIcon || '📄'
  await openCreatedNote(await treeStore.createNote(folderId, resolveNoteTitle(), icon))
}

async function createTemplatedNote(folderId: string | null, templateId: string, fieldValues: TemplateFieldValues = {}) {
  const icon = settings.value.workspace.defaultNoteIcon || '📄'
  await openCreatedNote(await treeStore.createNoteFromTemplate(templateId, folderId, resolveNoteTitle(), icon, fieldValues))
}

async function createNoteWithWorkspaceDefault(folderId: string | null) {
  mobileSidebarOpen.value = false
  const backend = workspaceStore.backend
  if (!templatesEnabled.value || !backend) {
    await createPlainNote(folderId)
    return
  }

  const templateId = settings.value.workspace.newNoteTemplate || 'blank'
  try {
    const template = await backend.getTemplate(templateId)
    if (template.fields.length === 0) {
      await createTemplatedNote(folderId, template.id)
      return
    }
    templateCreateFolderId.value = folderId
    templateCreatePickerOpen.value = true
  } catch {
    await createPlainNote(folderId)
  }
}

async function createNote() {
  await createNoteWithWorkspaceDefault(resolveNotePlacementFolder())
}

async function createNoteInFolder(folderId: string) {
  await createNoteWithWorkspaceDefault(folderId)
}

async function createNotebook() {
  mobileSidebarOpen.value = false
  await notebookCreation.create(resolveNotePlacementFolder())
}

async function handleTemplateCreate(payload: { template: TemplateDocument; fieldValues: TemplateFieldValues }) {
  templateCreatePickerOpen.value = false
  await createTemplatedNote(templateCreateFolderId.value, payload.template.id, payload.fieldValues)
  templateCreateFolderId.value = null
}
async function createFolder() {
  mobileSidebarOpen.value = false
  createFolderTitle.value = ''
  createFolderError.value = ''
  createFolderModalOpen.value = true
}

function closeCreateFolderModal() {
  createFolderModalOpen.value = false
  createFolderTitle.value = ''
  createFolderError.value = ''
}

async function submitCreateFolder() {
  const title = createFolderTitle.value.trim()
  if (!title) {
    createFolderError.value = t('workspace.createFolderModal.emptyName')
    return
  }
  const icon = settings.value.workspace.defaultFolderIcon || '📁'
  await treeStore.createFolder(resolveFolderPlacementFolder(), title, icon)
  closeCreateFolderModal()
}
async function importMd() {
  mobileSidebarOpen.value = false
  await openImportedNote(await importMarkdownFile(resolveNotePlacementFolder()))
}
function openObsidianImport() {
  mobileSidebarOpen.value = false
  obsidianImportFolderId.value = resolveNotePlacementFolder()
  obsidianImportOpen.value = true
}
function openNotionImport() {
  mobileSidebarOpen.value = false
  if (workspaceStore.backendKind === 'local') notionImportOpen.value = true
}
async function importMdToFolder(folderId: string) {
  mobileSidebarOpen.value = false
  await openImportedNote(await importMarkdownFile(folderId))
}
async function openImportedNote(noteId: string | null) {
  if (!noteId) return
  const meta = treeStore.noteById.get(noteId)
  tabsStore.openTab(noteId, meta?.title ?? t('workspace.untitledNote'), meta?.icon ?? '📄')
  await router.push(`/workspace/note/${noteId}`)
}
async function importMdIntoNote(noteId: string) {
  mobileSidebarOpen.value = false
  const isActiveImport = activeNoteId.value === noteId
  if (isActiveImport) await flushSave()
  const ok = await importMarkdownIntoNote(noteId, {
    beforePersist: isActiveImport
      ? async () => {
          noteStore.clearNote()
          await nextTick()
        }
      : undefined,
  })
  if (ok && activeNoteId.value === noteId) await noteStore.loadNote(noteId, { force: true })
}

const { renameModal, onTreeAction, handleRequestExport, submitRename, closeRenameModal } = useTreeContextMenu(
  { settings, manifest, activeNoteId, activeFolderId, activeNote, workspacePath: computed(() => workspaceStore.activePath), getBackend: () => workspaceStore.backend, treeOps: { deleteNote: treeStore.deleteNote, deleteFolder: treeStore.deleteFolder, renameFolder: treeStore.renameFolder, renameNote: treeStore.renameNote, syncNoteMeta: treeStore.syncNoteMeta }, clearNote: noteStore.clearNote, closeNoteTab, setTitle: noteStore.setTitle, flushSave, t, onUnsupportedExport: () => showToast({ message: t('app.notebook.unsupportedTextExport'), variant: 'error' }), renameInputRef },
  { openHistory, runSearch: async (seed) => { await runWorkspaceSearch(seed) }, navigateToNote: async (noteId) => { await router.push(`/workspace/note/${noteId}`) }, navigateToWorkspaceRoot: async () => { await router.push('/workspace') }, exportAsMarkdown, exportAsHtml, exportAsDocx: async (note, path) => { exportAsDocx(note, path) }, exportAsTypst, exportAsPdf },
)

useWorkspaceKeymap(settings, { createNote, createFolder, saveNote: flushSave, runSearch: () => toggleSearch(), toggleSidebar: () => toggleSidebarOrPin(), toggleRightPanel: () => uiStore.toggleRightPanel(), openGraph: () => openGraph(), openHistory: () => toggleHistory(), openTrash: () => toggleTrash(), openSettings: () => toggleSettings(), findInNote: () => { editorPaneRef.value?.openFindInNote?.(false) }, replaceInNote: () => { editorPaneRef.value?.openFindInNote?.(true) } })

watch(manifest, (workspace) => {
  if (!workspace) { router.replace('/onboarding'); return }
  if (kanbanEnabled.value) kanbanStore.loadBoards()
}, { immediate: true })
watch(kanbanEnabled, (enabled) => {
  if (enabled) kanbanStore.loadBoards()
})
watch(() => workspaceStore.activePath, () => { restoredRouteForWorkspace.value = null; tabsStore.clear() })
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
let noteRouteRevision = 0
const noteLoadError = ref(false)
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
function handleTitleBarSearchSelect(result: TitleBarSearchResult) {
  if (result.type === 'note') { openNote(result.id); return }
  if (result.type === 'folder') { openFolder(result.id); return }
  if (result.type === 'setting') {
    setPendingReveal(result.title)
    openSettings(result.section)
    return
  }
  pendingBlockTarget.value = { noteId: result.noteId, blockIndex: result.blockIndex, query: result.blockText, snippet: result.snippet }
  openNote(result.noteId)
}
function consumePendingBlockTarget() { pendingBlockTarget.value = null }
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
        <div v-if="useCompactHeader" class="titlebar-actions tw:flex tw:items-center tw:gap-1.5 tw:flex-none tw:[-webkit-app-region:no-drag]">
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
    </div>
    <MobileBottomNav
      v-if="showMobileBottomNav"
      :active="mobileActiveTab"
      @navigate="navigateMobile"
    />
  </div>

  <Teleport to="body">
    <div v-if="useDrawerNavigation && mobileSidebarOpen" class="workspace-drawer-backdrop tw:fixed tw:inset-0 tw:z-[55] tw:flex tw:justify-start tw:bg-scrim" @click.self="mobileSidebarOpen = false">
      <div class="workspace-drawer-panel tw:w-[min(92vw,340px)] tw:h-full tw:flex tw:flex-col tw:bg-(--frame-bg) tw:border-r-0 tw:shadow-(--shadow-overlay)">
        <div class="workspace-drawer-bar tw:flex tw:items-center tw:justify-between tw:gap-2 tw:p-3 tw:border-b-0">
          <button type="button" class="nv-btn tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]" @click="backToOnboarding"><ArrowLeft :size="12" /><span>{{ t('workspace.back') }}</span></button>
          <button type="button" class="nv-btn workspace-drawer-close tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]" :aria-label="t('workspace.closeDrawer')" @click="mobileSidebarOpen = false">
            <X :size="14" />
            <span>{{ t('workspace.closeDrawer') }}</span>
          </button>
        </div>
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
    </div>
  </Teleport>

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
    @close="() => { templateCreatePickerOpen = false; templateCreateFolderId = null }"
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
    @update:title="(value) => { createFolderTitle = value; createFolderError = '' }"
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

  <Teleport to="body">
    <div
      v-if="activePluginModal"
      class="sandbox-plugin-modal-backdrop"
      @click.self="activePluginModal = null"
      @keydown.esc="activePluginModal = null"
    >
      <section
        class="sandbox-plugin-modal"
        role="dialog"
        aria-modal="true"
        :aria-label="activePluginModal.id"
      >
        <button
          type="button"
          class="nv-btn sandbox-plugin-modal__close"
          :aria-label="t('workspace.pluginUi.closeModal')"
          @click="activePluginModal = null"
        >
          <X :size="15" />
        </button>
        <SandboxPluginFrame
          :src="activePluginModal.frame.source"
          :plugin-id="activePluginModal.pluginId"
          :locale="String(locale)"
          :theme="isDarkMode ? 'dark' : 'light'"
          :supported="!runtime.isMobileRuntime"
          :unsupported-label="t('workspace.pluginUi.unsupportedMobile')"
          @event="handlePluginFrameEvent(activePluginModal, $event)"
        />
      </section>
    </div>
  </Teleport>

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

.sandbox-plugin-modal-backdrop {
  position: fixed;
  z-index: 220;
  inset: 0;
  display: grid;
  padding: 24px;
  place-items: center;
  background: rgb(0 0 0 / 42%);
}

.sandbox-plugin-modal {
  position: relative;
  width: min(760px, calc(100vw - 48px));
  height: min(680px, calc(100dvh - 48px));
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  background: var(--surface-raised);
  box-shadow: var(--shadow-xl);
}

.sandbox-plugin-modal__close {
  position: absolute;
  z-index: 1;
  top: 10px;
  right: 10px;
}

@media (max-width: 719px) {
  .sandbox-plugin-modal-backdrop {
    padding: 0;
  }

  .sandbox-plugin-modal {
    width: 100vw;
    height: 100dvh;
    border: 0;
    border-radius: 0;
  }
}
</style>
