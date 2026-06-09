<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, History, Menu, PanelLeft, Settings2, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import WindowControls from '../ui/primitives/WindowControls.vue'
import WorkspaceRightPanel from './components/WorkspaceRightPanel.vue'
import WorkspaceRightTrigger from './components/WorkspaceRightTrigger.vue'
import WorkspaceSidebar from './components/WorkspaceSidebar.vue'
import WorkspaceEditorPane from './components/WorkspaceEditorPane.vue'
import WorkspaceHistoryModal from './components/WorkspaceHistoryModal.vue'
import WorkspaceTrashBin from './components/WorkspaceTrashBin.vue'
import PdfPreviewModal from './components/PdfPreviewModal.vue'
import WorkspaceSettingsModal from './components/WorkspaceSettingsModal.vue'
import WorkspaceRenameModal from './components/WorkspaceRenameModal.vue'
import UpdateDialog from './components/UpdateDialog.vue'
import TemplatePickerModal from './components/templates/TemplatePickerModal.vue'
import TitleBarSearch from './components/TitleBarSearch.vue'
import TitleBarTabs from './components/TitleBarTabs.vue'
import GraphView from '../features/graph/GraphView.vue'
import KanbanView from '../features/databases/kanban/KanbanView.vue'
import KanbanBoardModal from '../features/databases/kanban/KanbanBoardModal.vue'
import { useUiStore } from '../stores/ui'
import { useKanbanStore } from '../stores/kanban'
import { useWorkspaceStore } from '../stores/workspace'
import { useTreeStore } from '../stores/tree'
import { useNoteStore } from '../stores/note'
import { useTabsStore } from '../stores/tabs'
import { useThemeStore } from '../stores/theme'
import { useNotePersistence } from '../composables/useNotePersistence'
import { useWorkspaceKeymap } from './composables/useWorkspaceKeymap'
import { useTreeContextMenu } from './composables/useTreeContextMenu'
import type { FolderMeta, NoteDocument, TreeNode } from '../types/note'
import type { TemplateDocument, TemplateFieldValues } from '../types/template'
import type { SettingsSectionId } from '../types/workspace'
import type { TitleBarSearchResult, WorkspaceBlockNavigationTarget } from '../types/search'
import { ACCENT_PRESETS, resolveBindingChord } from '../utils/workspace-settings'
import { buildWorkspaceSettingsSearchItems } from './search/settings'
import { useNoteExport } from '../composables/useNoteExport'
import { useMarkdownImport } from '../composables/useMarkdownImport'
import { useDeviceLayout } from '../composables/useDeviceLayout'
import { useAppUpdater } from '../composables/useAppUpdater'
import { templateCommands } from '../tauri/commands'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const uiStore = useUiStore()
const { sidebarOpen, rightPanelOpen } = storeToRefs(uiStore)
const workspaceStore = useWorkspaceStore()
const treeStore = useTreeStore()
const noteStore = useNoteStore()
const themeStore = useThemeStore()
const { exportAsMarkdown, exportAsHtml, exportAsTypst, exportAsPdf, pdfPreview, closePdfPreview } = useNoteExport()
const { importMarkdownFile, importMarkdownIntoNote } = useMarkdownImport()

const appUpdater = useAppUpdater()

// Silently check for updates once the workspace shell mounts; the dialog only
// appears when a newer version is actually available.
onMounted(() => {
  void appUpdater.check({ silent: true })
})

const { manifest, settings, appConfig, plugins } = storeToRefs(workspaceStore)
const { tree, folderById } = storeToRefs(treeStore)
const { activeNote, saveStatus } = storeToRefs(noteStore)
const tabsStore = useTabsStore()
const { tabs, activeTabId } = storeToRefs(tabsStore)
const editorPaneRef = ref<{ editorRoot: HTMLDivElement | null; flushPendingContent?: () => void } | null>(null)
noteStore.setPendingContentFlush(() => editorPaneRef.value?.flushPendingContent?.())
const editorRootEl = computed(() => editorPaneRef.value?.editorRoot ?? null)
const { flushSave } = useNotePersistence()
const renameInputRef = ref<HTMLInputElement | null>(null)
const titleBarSearchRef = ref<{ focusSearch: (seed?: string) => void } | null>(null)
const mobileSidebarOpen = ref(false)
const settingsModalOpen = ref(false)
const settingsModalSection = ref<SettingsSectionId | null>(null)
const historyModalOpen = ref(false)
const trashModalOpen = ref(false)
const historyModalPreselectedNoteId = ref<string | null>(null)
const boardModal = reactive<{
  open: boolean
  mode: 'create' | 'rename' | 'delete'
  boardId?: string
  boardTitle?: string
  boardIcon?: string
}>({ open: false, mode: 'create' })
const restoredRouteForWorkspace = ref<string | null>(null)
const pendingBlockTarget = ref<WorkspaceBlockNavigationTarget | null>(null)
const templateCreatePickerOpen = ref(false)
const templateCreateFolderId = ref<string | null>(null)
const { runtime, useDrawerNavigation, useCompactHeader, useFullscreenDialogs, shellStyle } = useDeviceLayout()

const activeFolderId = computed(() => route.params.folderId ? String(route.params.folderId) : null)
const activeNoteId = computed(() => route.params.noteId ? String(route.params.noteId) : null)
const routeBoardId = computed(() => route.params.boardId ? String(route.params.boardId) : null)
const isGraphView = computed(() => route.path === '/workspace/graph')
const isKanbanView = computed(() => !!routeBoardId.value)

const kanbanStore = useKanbanStore()
const { activeBoardId: activeBoardId } = storeToRefs(kanbanStore)

const workspaceRootStyle = computed(() => {
  const val = settings.value.appearance.accentPreset
  const accent = ACCENT_PRESETS[val]
  if (accent) {
    return {
      '--accent': accent.accent,
      '--accent-soft': accent.soft,
      '--accent-glow': accent.glow,
      '--selection': `color-mix(in oklab, ${accent.accent} 25%, transparent)`,
      ...shellStyle.value,
    }
  }
  return {
    '--accent': val,
    '--accent-soft': `color-mix(in oklab, ${val} 14%, transparent)`,
    '--accent-glow': `color-mix(in oklab, ${val} 32%, transparent)`,
    '--selection': `color-mix(in oklab, ${val} 25%, transparent)`,
    ...shellStyle.value,
  }
})
const workspaceRootClasses = computed(() => ({
  'workspace-root--compact': appConfig.value.interfaceDensity === 'compact',
  'workspace-root--drawer': useDrawerNavigation.value,
  'workspace-root--fullscreen-dialogs': useFullscreenDialogs.value,
  'workspace-root--reduced-motion': appConfig.value.reducedMotion === 'reduce',
}))
const settingsSearchItems = computed(() => buildWorkspaceSettingsSearchItems({ t, manifest: manifest.value, settings: settings.value, appConfig: appConfig.value, plugins: plugins.value, pluginValidation: {}, locale: appConfig.value.locale, themeMode: themeStore.theme }))
const workspaceSearchShortcut = computed(() => { const b = settings.value.hotkeys.bindings.find(x => x.commandId === 'workspace.search'); return b ? resolveBindingChord(b) : 'Ctrl+P' })
const sidebarTree = computed(() => settings.value.workspace.rootNotesVisible ? tree.value : tree.value.filter(node => node.kind !== 'note'))
const kanbanEnabled = computed(() => settings.value.features?.kanban !== false)
const boardsMeta = computed(() => kanbanStore.boardsList.map(b => ({ id: b.id, title: b.title, icon: b.icon, updatedAt: b.updatedAt })))

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

async function runWorkspaceSearch(seed = '') { titleBarSearchRef.value?.focusSearch(seed) }
function openSettings(section: SettingsSectionId | null = null) { mobileSidebarOpen.value = false; settingsModalSection.value = section; settingsModalOpen.value = true }
function openTrash() { mobileSidebarOpen.value = false; trashModalOpen.value = true }
function openHistory(noteId: string | null = null) { mobileSidebarOpen.value = false; historyModalPreselectedNoteId.value = noteId; historyModalOpen.value = true }
function openNote(noteId: string) {
  mobileSidebarOpen.value = false
  const meta = treeStore.noteById.get(noteId)
  tabsStore.openTab(noteId, meta?.title ?? t('workspace.untitledNote'), meta?.icon ?? '📄')
  if (activeNoteId.value === noteId && !isGraphView.value) return
  flushSave()
  router.push(`/workspace/note/${noteId}`)
}
function closeTab(tabId: string) {
  const nextNoteId = tabsStore.closeTab(tabId)
  if (nextNoteId) router.push(`/workspace/note/${nextNoteId}`)
  else router.push('/workspace')
}
function openFolder(folderId: string) { mobileSidebarOpen.value = false; if (activeFolderId.value === folderId) return; flushSave(); router.push(`/workspace/folder/${folderId}`) }
function openGraph() { mobileSidebarOpen.value = false; if (isGraphView.value) return; flushSave(); router.push('/workspace/graph') }
function openBoard(boardId: string) { mobileSidebarOpen.value = false; flushSave(); router.push(`/workspace/board/${boardId}`) }
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
  if (settings.value.features?.templates === false || !workspaceStore.activePath) {
    await createPlainNote(folderId)
    return
  }

  const templateId = settings.value.workspace.newNoteTemplate || 'blank'
  try {
    const template = await templateCommands.getTemplate(workspaceStore.activePath, templateId)
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

async function handleTemplateCreate(payload: { template: TemplateDocument; fieldValues: TemplateFieldValues }) {
  templateCreatePickerOpen.value = false
  await createTemplatedNote(templateCreateFolderId.value, payload.template.id, payload.fieldValues)
  templateCreateFolderId.value = null
}
async function createFolder() {
  mobileSidebarOpen.value = false
  const title = window.prompt(t('workspace.newFolderPrompt'))
  if (!title?.trim()) return
  const icon = settings.value.workspace.defaultFolderIcon || '📁'
  await treeStore.createFolder(resolveFolderPlacementFolder(), title.trim(), icon)
}
async function importMd() {
  mobileSidebarOpen.value = false
  await openImportedNote(await importMarkdownFile(resolveNotePlacementFolder()))
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
  if (activeNoteId.value === noteId) await flushSave()
  const ok = await importMarkdownIntoNote(noteId)
  if (ok && activeNoteId.value === noteId) await noteStore.loadNote(noteId)
}

const { renameModal, onTreeAction, handleRequestExport, submitRename, closeRenameModal } = useTreeContextMenu(
  { settings, manifest, activeNoteId, activeFolderId, activeNote, workspacePath: computed(() => workspaceStore.activePath), treeOps: { deleteNote: treeStore.deleteNote, deleteFolder: treeStore.deleteFolder, renameFolder: treeStore.renameFolder, renameNote: treeStore.renameNote, syncNoteMeta: treeStore.syncNoteMeta }, clearNote: noteStore.clearNote, setTitle: noteStore.setTitle, flushSave, t, renameInputRef },
  { openHistory, runSearch: async (seed) => { await runWorkspaceSearch(seed) }, navigateToWorkspaceRoot: async () => { await router.push('/workspace') }, exportAsMarkdown, exportAsHtml, exportAsTypst, exportAsPdf },
)

useWorkspaceKeymap(settings, { createNote, createFolder, saveNote: flushSave, runSearch: () => runWorkspaceSearch(), toggleSidebar: () => uiStore.toggleSidebar(), openSettings: () => openSettings() })

watch(manifest, (workspace) => {
  if (!workspace) { router.replace('/onboarding'); return }
  if (settings.value.features?.kanban !== false) kanbanStore.loadBoards()
}, { immediate: true })
watch(() => workspaceStore.activePath, () => { restoredRouteForWorkspace.value = null; tabsStore.clear() })
watch(() => useDrawerNavigation.value, (drawerMode) => { if (!drawerMode) mobileSidebarOpen.value = false }, { immediate: true })
watch(() => route.fullPath, () => { mobileSidebarOpen.value = false })
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
  () => ({ workspacePath: workspaceStore.activePath, currentRoute: route.fullPath, restoreLastContext: settings.value.general.restoreLastContext, noteId: settings.value.general.lastContext.noteId, folderId: settings.value.general.lastContext.folderId }),
  async ({ workspacePath, currentRoute, restoreLastContext, noteId, folderId }) => {
    if (!workspacePath || currentRoute !== '/workspace' || !restoreLastContext || restoredRouteForWorkspace.value === workspacePath) return
    restoredRouteForWorkspace.value = workspacePath
    if (noteId) {
      const meta = treeStore.noteById.get(noteId)
      tabsStore.openTab(noteId, meta?.title ?? t('workspace.untitledNote'), meta?.icon ?? '📄')
      await router.replace(`/workspace/note/${noteId}`)
      return
    }
    if (folderId) await router.replace(`/workspace/folder/${folderId}`)
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
watch(() => [workspaceStore.activePath, activeNoteId.value, activeFolderId.value], async ([workspacePath, noteId, folderId]) => {
  if (!workspacePath) return
  await workspaceStore.updateLastContext({ noteId: noteId ? String(noteId) : null, folderId: folderId ? String(folderId) : null })
})
watch(activeNoteId, async (noteId) => {
  if (!noteId) { noteStore.clearNote(); return }
  try {
    await noteStore.loadNote(noteId)
    if (settings.value.workspace.showBacklinksByDefault) {
      rightPanelOpen.value = true
    }
  } catch { router.replace('/workspace') }
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
function markContentDirty() { noteStore.markContentDirty() }
async function handleHistoryRestored(restoredNote: NoteDocument) {
  treeStore.syncNoteMeta(restoredNote.id, { title: restoredNote.title, icon: restoredNote.icon }, restoredNote.updatedAt)
  if (activeNoteId.value === restoredNote.id) await noteStore.loadNote(restoredNote.id)
}
function handleTitleBarSearchSelect(result: TitleBarSearchResult) {
  if (result.type === 'note') { openNote(result.id); return }
  if (result.type === 'folder') { openFolder(result.id); return }
  if (result.type === 'setting') { openSettings(result.section); return }
  pendingBlockTarget.value = { noteId: result.noteId, blockIndex: result.blockIndex, query: result.blockText, snippet: result.snippet }
  openNote(result.noteId)
}
function consumePendingBlockTarget() { pendingBlockTarget.value = null }
</script>

<template>
  <div class="nv-app workspace-root" :class="workspaceRootClasses" :style="workspaceRootStyle">
    <div class="nv-canvas" />

    <header class="workspace-titlebar" :class="{ 'workspace-titlebar--compact-layout': useCompactHeader, 'workspace-titlebar--drag': runtime.supportsWindowDragRegions }">
      <div class="titlebar-leading">
        <button v-if="useDrawerNavigation" type="button" class="nv-btn workspace-drawer-toggle" :aria-label="t('workspace.localWorkspace')" @click="mobileSidebarOpen = true"><Menu :size="15" /></button>
        <button v-if="!useDrawerNavigation" type="button" class="nv-btn workspace-sidebar-toggle" :aria-label="t('workspace.toggleSidebar')" :class="{ 'workspace-sidebar-toggle--collapsed': !sidebarOpen }" @click="uiStore.toggleSidebar()"><PanelLeft :size="15" /></button>
      </div>
      <TitleBarTabs :tabs="tabs" :active-tab-id="activeTabId" @select="openNote" @close="closeTab" @reorder="(from, to) => tabsStore.moveTab(from, to)" />
      <div class="titlebar-trailing">
        <div v-if="useCompactHeader" class="titlebar-actions">
          <button type="button" class="nv-btn titlebar-action-btn" :title="t('workspace.system.history')" @click="openHistory()"><History :size="13" /><span class="titlebar-action-label">{{ t('workspace.system.history') }}</span></button>
          <button type="button" class="nv-btn titlebar-action-btn" :title="t('workspace.system.settings')" @click="openSettings()"><Settings2 :size="13" /><span class="titlebar-action-label">{{ t('workspace.system.settings') }}</span></button>
        </div>
        <TitleBarSearch ref="titleBarSearchRef" :manifest="manifest" :workspace-path="workspaceStore.activePath" :settings-items="settingsSearchItems" :search-shortcut="workspaceSearchShortcut" @select-result="handleTitleBarSearchSelect" />
      </div>
      <WindowControls v-if="runtime.supportsWindowControls" />
    </header>

    <div class="workspace-body" :class="{ 'workspace-body--drawer': useDrawerNavigation }">
      <div v-if="!useDrawerNavigation" class="workspace-sidebar-shell workspace-sidebar-shell--desktop" :class="{ 'workspace-sidebar-shell--hidden': !sidebarOpen }">
        <WorkspaceSidebar :workspace-name="manifest?.name ?? t('workspace.noWorkspace')" :workspace-glyph="manifest?.glyph ?? 'N'" :tree="sidebarTree" :active-note-id="activeNoteId" :active-folder-id="activeFolderId" :boards="boardsMeta" :active-board-id="activeBoardId" :kanban-enabled="kanbanEnabled" :backend-kind="workspaceStore.backendKind" @create-note="createNote" @create-note-in-folder="createNoteInFolder" @create-folder="createFolder" @import-md="importMd" @import-into-folder="importMdToFolder" @import-into-note="importMdIntoNote" @open-note="openNote" @open-folder="openFolder" @tree-action="onTreeAction" @open-history="openHistory()" @open-trash="openTrash" @open-settings="openSettings" @open-graph="openGraph" @open-board="openBoard" @create-board="createBoard" @board-action="onBoardAction" @back-to-onboarding="backToOnboarding" />
      </div>
      <GraphView v-if="isGraphView" :workspace-path="workspaceStore.activePath" :manifest="manifest" :active-note-id="activeNoteId" @open-note="openNote" @back="() => router.push('/workspace')" />
      <KanbanView v-else-if="isKanbanView && routeBoardId" :board-id="routeBoardId" @back="() => router.push('/workspace')" />
      <WorkspaceEditorPane v-else ref="editorPaneRef" :note="activeNote" :workspace-path="workspaceStore.activePath" :workspace-name="manifest?.name ?? ''" :plugin-manifests="workspaceStore.plugins" :settings="settings" :save-status="saveStatus" :container-title="containerOverview.title" :container-kind="containerOverview.kind" :container-items="containerOverview.items" :pending-block-target="pendingBlockTarget" @update:title="updateTitle" @update:icon="updateIcon" @update:cover="updateCover" @update:content="updateContent" @content-dirty="markContentDirty" @create-note="createNote" @consumed-pending-target="consumePendingBlockTarget" @open-note="openNote" @open-folder="openFolder" @request-export="handleRequestExport" @request-import-md="() => activeNoteId && importMdIntoNote(activeNoteId)" />
      <WorkspaceRightTrigger v-if="!rightPanelOpen && !isGraphView && !isKanbanView && !useDrawerNavigation" />
      <div class="workspace-right-panel-shell" :class="{ 'workspace-right-panel-shell--hidden': !rightPanelOpen }">
        <WorkspaceRightPanel
          v-if="rightPanelOpen"
          :note="activeNote"
          :editor-root-el="editorRootEl"
          @close="uiStore.toggleRightPanel()"
          @open-note="openNote"
        />
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="useDrawerNavigation && mobileSidebarOpen" class="workspace-drawer-backdrop" @click.self="mobileSidebarOpen = false">
      <div class="workspace-drawer-panel">
        <div class="workspace-drawer-bar">
          <button type="button" class="nv-btn" @click="backToOnboarding"><ArrowLeft :size="12" /><span>{{ t('workspace.back') }}</span></button>
          <button type="button" class="nv-btn" @click="mobileSidebarOpen = false">{{ t('workspace.context.cancel') }}</button>
        </div>
        <WorkspaceSidebar :workspace-name="manifest?.name ?? t('workspace.noWorkspace')" :workspace-glyph="manifest?.glyph ?? 'N'" :tree="sidebarTree" :active-note-id="activeNoteId" :active-folder-id="activeFolderId" :boards="boardsMeta" :active-board-id="activeBoardId" :kanban-enabled="kanbanEnabled" :backend-kind="workspaceStore.backendKind" @create-note="createNote" @create-note-in-folder="createNoteInFolder" @create-folder="createFolder" @import-md="importMd" @import-into-folder="importMdToFolder" @import-into-note="importMdIntoNote" @open-note="openNote" @open-folder="openFolder" @tree-action="onTreeAction" @open-history="openHistory()" @open-trash="openTrash" @open-settings="openSettings" @open-graph="openGraph" @open-board="openBoard" @create-board="createBoard" @board-action="onBoardAction" @back-to-onboarding="backToOnboarding" />
      </div>
    </div>
  </Teleport>

  <WorkspaceHistoryModal :open="historyModalOpen" :workspace-path="workspaceStore.activePath" :manifest="manifest" :active-note-id="activeNoteId" :active-note="activeNote" :preselected-note-id="historyModalPreselectedNoteId" @close="historyModalOpen = false" @restored="handleHistoryRestored" />
  
  <Teleport to="body">
    <div v-if="trashModalOpen" class="history-modal-backdrop" @click.self="trashModalOpen = false">
      <section class="history-modal trash-modal">
        <div class="history-modal__titlebar">
          <span>{{ t('workspace.trash.title') }}</span>
          <button type="button" class="history-modal__close" :aria-label="t('workspace.context.cancel')" @click="trashModalOpen = false">
            <X :size="15" />
          </button>
        </div>
        <div class="history-modal__shell">
          <WorkspaceTrashBin />
        </div>
      </section>
    </div>
  </Teleport>

  <WorkspaceSettingsModal :open="settingsModalOpen" :initial-section="settingsModalSection" @close="() => { settingsModalOpen = false; settingsModalSection = null }" />
  <PdfPreviewModal v-if="pdfPreview.open && pdfPreview.note" :note="pdfPreview.note" :workspace-path="pdfPreview.workspacePath" @close="closePdfPreview" />
  <TemplatePickerModal
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

  <UpdateDialog />
</template>

<style scoped>
.trash-modal {
  width: min(640px, calc(100vw - 36px));
  height: min(600px, calc(100vh - 36px));
}

.trash-modal :deep(.history-modal__shell) {
  display: flex;
  flex-direction: column;
}
</style>
