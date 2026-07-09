<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { ArrowLeft, Download, FolderPen, History, Kanban, MoreHorizontal, Network, Plus, Search, Settings, Tag, Trash2, Upload } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import type { SidebarNotePreview, TreeNode } from '../../types/note'
import type { KanbanBoardMeta } from '../../types/kanban'
import type { SidebarContentMode } from '../../types/workspace'
import WorkspaceTreeNode from './WorkspaceTreeNode.vue'
import SidebarActionBar from './SidebarActionBar.vue'
import { collectFolderIds, filterTree, sortTree, type SortMode } from '../composables/useSidebarTree'
import NvPopupMenu from '../../ui/primitives/NvPopupMenu.vue'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
import type { NvMenuItemDef } from '../../ui/primitives/menu-types'
import NvMenuItem from '../../ui/primitives/NvMenuItem.vue'
import NvMenuSeparator from '../../ui/primitives/NvMenuSeparator.vue'
import WorkspaceMembersPanel from './WorkspaceMembersPanel.vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTreeStore } from '../../stores/tree'
import { filterSidebarPreviewsByTags, sortSidebarPreviews } from '../../utils/sidebar/sidebarNotePreviews'
import { useSidebarDrag, type SidebarDragTarget, type SidebarDragSource } from '../composables/useSidebarDrag'

interface Props {
  workspaceName: string
  workspaceGlyph: string
  tree: TreeNode[]
  activeNoteId: string | null
  activeFolderId: string | null
  boards?: KanbanBoardMeta[]
  activeBoardId?: string | null
  kanbanEnabled?: boolean
  backendKind?: 'local' | 'cloud' | null
  sidebarMode?: SidebarContentMode
  notePreviews?: SidebarNotePreview[]
}

const props = defineProps<Props>()
const route = useRoute()
const isGraphActive = computed(() => route.path === '/workspace/graph')

type TreeMenuAction = 'rename' | 'delete' | 'search' | 'history' | 'export'
type ExportFormat = 'markdown' | 'html' | 'docx' | 'typst' | 'pdf'
type TreeMenuTarget = {
  kind: 'folder' | 'note'
  id: string
  title: string
  folderId: string | null
}
type BoardMenuAction = 'rename' | 'delete'

const emit = defineEmits<{
  'create-note': []
  'create-folder': []
  'import-md': []
  'import-into-folder': [folderId: string]
  'import-into-note': [noteId: string]
  'open-note': [noteId: string]
  'open-folder': [folderId: string]
  'create-note-in-folder': [folderId: string]
  'tree-action': [payload: { action: TreeMenuAction; target: TreeMenuTarget; format?: ExportFormat }]
  'board-action': [payload: { action: BoardMenuAction; boardId: string; boardTitle: string; boardIcon: string }]
  'open-history': []
  'open-settings': [],
  'open-trash': [],
  'open-graph': [],
  'open-board': [boardId: string]
  'create-board': []
  'back-to-onboarding': []
}>()
const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const treeStore = useTreeStore()
const drag = useSidebarDrag()

/** DnD активен во всех режимах сортировки; при переупорядочивании в не-manual
 *  режиме автоматически переключаемся на manual, чтобы порядок применился. */
const dragEnabled = computed(() => sidebarMode.value === 'tree')
const tagPreviewDragEnabled = computed(() => sidebarMode.value === 'tag-preview')
const sidebarNoteOrder = computed<string[]>(
  () => workspaceStore.manifest?.sidebarNoteOrder ?? [],
)

/** Гарантирует, что активна ручная сортировка — иначе переупорядочивание
 *  бессмысленно (другие режимы пересортируют поверх). */
function ensureManualSort() {
  if (sortMode.value !== 'manual') {
    workspaceStore.updateSettings((draft) => {
      draft.workspace.sidebarSortMode = 'manual'
    })
  }
}

const collapsedFolders = reactive<Record<string, boolean>>({})
const isRememberEnabled = computed(() => workspaceStore.settings.workspace.rememberExpandedFolders)
const storageKey = computed(() => workspaceStore.activePath ? `nevo:collapsed-folders:${workspaceStore.activePath}` : null)

watch(storageKey, (key) => {
  for (const k of Object.keys(collapsedFolders)) {
    delete collapsedFolders[k]
  }
  if (!key || !isRememberEnabled.value) return
  try {
    const saved = localStorage.getItem(key)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (typeof parsed === 'object' && parsed !== null) {
        Object.assign(collapsedFolders, parsed)
      }
    }
  } catch (e) {
    console.error('Failed to load collapsed folders state:', e)
  }
}, { immediate: true })

// Persist collapse state, but debounce the synchronous localStorage write so
// rapidly toggling folders doesn't serialize + write on every single toggle.
watchDebounced(collapsedFolders, (nextState) => {
  const key = storageKey.value
  if (!key || !isRememberEnabled.value) return
  try {
    localStorage.setItem(key, JSON.stringify(nextState))
  } catch (e) {
    console.error('Failed to save collapsed folders state:', e)
  }
}, { deep: true, debounce: 300 })

watch(isRememberEnabled, (enabled) => {
  if (!enabled) {
    const key = storageKey.value
    if (key) localStorage.removeItem(key)
    for (const k of Object.keys(collapsedFolders)) {
      delete collapsedFolders[k]
    }
  } else {
    const key = storageKey.value
    if (key) {
      try {
        const saved = localStorage.getItem(key)
        if (saved) {
          Object.assign(collapsedFolders, JSON.parse(saved))
        }
      } catch {}
    }
  }
})

const contextMenu = reactive<{
  open: boolean
  target: TreeMenuTarget | null
}>({ open: false, target: null })
const cursorPos = ref({ top: 0, left: 0 })
const boardContextMenu = reactive<{
  open: boolean
  boardId: string | null
  boardTitle: string
  boardIcon: string
}>({ open: false, boardId: null, boardTitle: '', boardIcon: '' })
const boardCursorPos = ref({ top: 0, left: 0 })
const isTreeEmpty = computed(() => !props.tree.length)
const selectedTags = ref<Set<string>>(new Set())
const sidebarMode = computed(() => props.sidebarMode ?? 'tree')
const sortMode = computed<SortMode>(() => workspaceStore.settings.workspace.sidebarSortMode)
const sortedNotePreviews = computed(() =>
  sortSidebarPreviews(props.notePreviews ?? [], sortMode.value, sidebarNoteOrder.value),
)
const tagStats = computed(() => {
  const counts = new Map<string, { label: string; count: number }>()
  for (const preview of sortedNotePreviews.value) {
    for (const tag of preview.tags) {
      const key = tag.toLowerCase()
      const current = counts.get(key)
      if (current) current.count += 1
      else counts.set(key, { label: tag, count: 1 })
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
})
const filteredNotePreviews = computed(() =>
  filterSidebarPreviewsByTags(sortedNotePreviews.value, selectedTags.value),
)
const rootDropActive = ref(false)
const tagPreviewEmptyKind = computed<'no-notes' | 'no-matches' | null>(() => {
  if (filteredNotePreviews.value.length) return null
  return selectedTags.value.size ? 'no-matches' : 'no-notes'
})

const showEmptyFolders = computed(() => workspaceStore.settings.workspace.showEmptyFolders)
const sortedTree = computed(() => {
  const sorted = sortTree(props.tree, sortMode.value)
  return filterTree(sorted, showEmptyFolders.value)
})
const collapseState = computed<'collapsed' | 'expanded'>(() =>
  collectFolderIds(props.tree).some((id) => collapsedFolders[id]) ? 'collapsed' : 'expanded',
)

function onTreeNodeDragStart(event: DragEvent, source: SidebarDragSource) {
  drag.onDragStart(event, source)
}

async function onTreeNodeDrop(event: DragEvent, target: SidebarDragTarget) {
  const result = drag.resolveTreeDrop(event, target)
  if (!result) {
    drag.resetDragState(false)
    return
  }
  try {
    if (result.kind === 'move') {
      await treeStore.moveNote(result.sourceId, result.targetFolderId)
    } else if (result.kind === 'move-root') {
      await treeStore.moveNote(result.sourceId, null)
    } else if (result.kind === 'move-position') {
      ensureManualSort()
      await treeStore.moveNoteToPosition(result.sourceId, result.targetId, result.position, result.parentId)
    } else {
      ensureManualSort()
      await treeStore.reorderItem(result.sourceId, result.targetId, result.position, result.parentId)
    }
  } finally {
    drag.resetDragState(true)
  }
}

function onTreeNodeDragEnter(targetId: string) {
  drag.onDragEnterRow(targetId)
}

function onTreeNodeDragLeave(targetId: string) {
  drag.onDragLeaveRow(targetId)
}

function onTreeNodeDragOver(target: SidebarDragTarget, isFolderTarget: boolean, event: DragEvent) {
  rootDropActive.value = false
  drag.onDragOverRow(event, target, isFolderTarget)
}

function onTreeRootDragOver(event: DragEvent) {
  if (!dragEnabled.value) return
  rootDropActive.value = drag.onDragOverRoot(event)
}

function onTreeRootDragLeave() {
  rootDropActive.value = false
}

async function onTreeRootDrop(event: DragEvent) {
  rootDropActive.value = false
  const result = drag.resolveRootDrop(event)
  if (!result) {
    drag.resetDragState(false)
    return
  }
  try {
    await treeStore.moveNote(result.sourceId, null)
  } finally {
    drag.resetDragState(true)
  }
}

function resetTreeDragState() {
  rootDropActive.value = false
  drag.resetDragState(false)
}

/** Tag-preview: переупорядочивание плоского списка заметок. */
async function onPreviewDrop(event: DragEvent, preview: { noteId: string }) {
  const result = drag.resolveFlatDrop(event, preview.noteId)
  if (!result) {
    drag.resetDragState(false)
    return
  }
  const currentOrder = sortedNotePreviews.value.map((p) => p.noteId)
  const fromIdx = currentOrder.indexOf(result.sourceId)
  const toIdx = currentOrder.indexOf(result.targetId)
  if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
    const next = currentOrder.slice()
    const [moved] = next.splice(fromIdx, 1)
    next.splice(fromIdx < toIdx ? toIdx - 1 : toIdx, 0, moved)
    ensureManualSort()
    await treeStore.setSidebarNoteOrder(next)
  }
  drag.resetDragState(true)
}

function onPreviewDragStart(event: DragEvent, preview: { noteId: string }) {
  drag.onDragStart(event, { id: preview.noteId, kind: 'note', parentId: null })
}

function onPreviewDragOver(event: DragEvent, preview: { noteId: string }) {
  if (!tagPreviewDragEnabled.value) return
  drag.onDragOverRow(event, { id: preview.noteId, kind: 'note', parentId: null }, false)
}

function onPreviewDragEnter(preview: { noteId: string }) {
  if (!tagPreviewDragEnabled.value) return
  drag.onDragEnterRow(preview.noteId)
}

function onPreviewDragLeave(preview: { noteId: string }) {
  if (!tagPreviewDragEnabled.value) return
  drag.onDragLeaveRow(preview.noteId)
}

function onPreviewCardClick(preview: { noteId: string }) {
  if (drag.shouldSuppressClick()) return
  emit('open-note', preview.noteId)
}

function onSortModeChange(mode: SortMode) {
  workspaceStore.updateSettings((draft) => {
    draft.workspace.sidebarSortMode = mode
  })
}

function isTagSelected(tag: string) {
  return selectedTags.value.has(tag.toLowerCase())
}

function toggleTag(tag: string) {
  const key = tag.toLowerCase()
  const next = new Set(selectedTags.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedTags.value = next
}

function clearSelectedTags() {
  selectedTags.value = new Set()
}

function formatPreviewDate(value: string) {
  if (!value) return ''
  return workspaceStore.getRelativeTime(value)
}

function onToggleFolder(folderId: string) {
  collapsedFolders[folderId] = !collapsedFolders[folderId]
}

function toggleCollapseAll() {
  if (collapseState.value === 'expanded') {
    for (const id of collectFolderIds(props.tree)) collapsedFolders[id] = true
  } else {
    for (const key of Object.keys(collapsedFolders)) delete collapsedFolders[key]
  }
}

function onContextMenu(payload: TreeMenuTarget & { x: number; y: number }) {
  cursorPos.value = { top: payload.y, left: payload.x }
  contextMenu.target = { kind: payload.kind, id: payload.id, title: payload.title, folderId: payload.folderId }
  contextMenu.open = true
}

function onPreviewContextMenu(event: MouseEvent, preview: SidebarNotePreview) {
  event.preventDefault()
  event.stopPropagation()
  cursorPos.value = { top: event.clientY, left: event.clientX }
  contextMenu.target = {
    kind: 'note',
    id: preview.noteId,
    title: preview.title,
    folderId: null,
  }
  contextMenu.open = true
}

function runContextAction(action: TreeMenuAction) {
  const target = contextMenu.target
  if (!target) return
  emit('tree-action', { action, target })
  contextMenu.open = false
  contextMenu.target = null
}

function runExportContextAction(format: ExportFormat) {
  const target = contextMenu.target
  if (!target) return
  emit('tree-action', { action: 'export', target, format })
  contextMenu.open = false
  contextMenu.target = null
}

function runImportIntoNote() {
  const target = contextMenu.target
  if (!target || target.kind !== 'note') return
  emit('import-into-note', target.id)
  contextMenu.open = false
  contextMenu.target = null
}

function runImportIntoFolder() {
  const target = contextMenu.target
  if (!target || target.kind !== 'folder') return
  emit('import-into-folder', target.id)
  contextMenu.open = false
  contextMenu.target = null
}

const exportMenuItems = computed<NvMenuItemDef[]>(() => [
  {
    label: t('export.formatMarkdown'),
    action: () => runExportContextAction('markdown'),
  },
  {
    label: t('export.formatHtml'),
    action: () => runExportContextAction('html'),
  },
  {
    label: t('export.formatDocx'),
    action: () => runExportContextAction('docx'),
  },
  {
    label: t('export.formatTypst'),
    action: () => runExportContextAction('typst'),
  },
  {
    label: t('export.formatPdf'),
    action: () => runExportContextAction('pdf'),
  },
])

function onBoardContextMenu(e: MouseEvent, board: KanbanBoardMeta) {
  boardCursorPos.value = { top: e.clientY, left: e.clientX }
  boardContextMenu.boardId = board.id
  boardContextMenu.boardTitle = board.title
  boardContextMenu.boardIcon = board.icon
  boardContextMenu.open = true
}

function runBoardAction(action: BoardMenuAction) {
  if (!boardContextMenu.boardId) return
  emit('board-action', { action, boardId: boardContextMenu.boardId, boardTitle: boardContextMenu.boardTitle, boardIcon: boardContextMenu.boardIcon })
  boardContextMenu.open = false
}
</script>

<template>
  <aside class="sidebar" :class="{ 'sidebar--tag-preview': sidebarMode === 'tag-preview' }">
    <div class="workspace-head">
      <div class="workspace-glyph"><NvNoteIcon :value="workspaceGlyph" :size="16" /></div>
      <div class="workspace-meta">
        <div class="workspace-name">{{ workspaceName }}</div>
        <div class="workspace-subtitle">{{ backendKind === 'cloud' ? t('workspace.cloudWorkspace') : t('workspace.localWorkspace') }}</div>
      </div>
      <button type="button" class="workspace-head-back nv-btn" :title="t('workspace.back')" @click="emit('back-to-onboarding')">
        <ArrowLeft :size="13" />
      </button>
    </div>

    <WorkspaceMembersPanel v-if="backendKind === 'cloud'" />

    <SidebarActionBar
      :kanban-enabled="kanbanEnabled"
      :collapse-state="collapseState"
      :sort-mode="sortMode"
      @create-note="emit('create-note')"
      @create-folder="emit('create-folder')"
      @create-board="emit('create-board')"
      @import-md="emit('import-md')"
      @toggle-collapse-all="toggleCollapseAll"
      @update:sort-mode="onSortModeChange"
    />

    <div v-if="sidebarMode === 'tree'" class="tree-wrap" @dragend="resetTreeDragState">
      <div v-if="isTreeEmpty" class="tree-empty">
        <div class="tree-empty__title">{{ t('workspace.emptyTree.title') }}</div>
        <div class="tree-empty__subtitle">{{ t('workspace.emptyTree.subtitle') }}</div>
        <div class="tree-empty__actions">
          <button type="button" class="nv-btn nv-btn--primary" @click="emit('create-note')">
            <Plus :size="12" />
            <span>{{ t('workspace.actions.newNote') }}</span>
          </button>
          <button type="button" class="nv-btn" @click="emit('create-folder')">
            <FolderPen :size="12" />
            <span>{{ t('workspace.actions.newFolder') }}</span>
          </button>
        </div>
      </div>

      <WorkspaceTreeNode
        v-for="node in sortedTree"
        :key="node.meta.id"
        :node="node"
        :depth="0"
        :active-note-id="activeNoteId"
        :active-folder-id="activeFolderId"
        :collapsed-folders="collapsedFolders"
        :drag-enabled="dragEnabled"
        :dragged-id="drag.draggedSource.value?.id ?? null"
        :drag-over="drag.dragOver.value"
        @toggle-folder="onToggleFolder"
        @open-folder="emit('open-folder', $event)"
        @open-note="emit('open-note', $event)"
        @create-note-in-folder="emit('create-note-in-folder', $event)"
        @context-menu="onContextMenu"
        @drag-start="onTreeNodeDragStart"
        @drag-over="onTreeNodeDragOver"
        @drag-enter="onTreeNodeDragEnter"
        @drag-leave="onTreeNodeDragLeave"
        @drop="onTreeNodeDrop"
      />

      <div
        class="tree-root-drop-zone"
        :class="{ 'tree-root-drop-zone--active': rootDropActive }"
        @dragover.stop.prevent="onTreeRootDragOver"
        @dragleave="onTreeRootDragLeave"
        @drop.stop.prevent="onTreeRootDrop"
      />
    </div>

    <div v-else class="tag-preview-wrap">
      <div class="tag-preview-tags" :aria-label="t('workspace.sidebarPreview.tagsLabel')">
        <button
          v-for="tag in tagStats"
          :key="tag.label"
          type="button"
          class="tag-preview-tag"
          :class="{ 'tag-preview-tag--active': isTagSelected(tag.label) }"
          @click="toggleTag(tag.label)"
        >
          <Tag :size="11" />
          <span class="tag-preview-tag__label">{{ tag.label }}</span>
          <span class="tag-preview-tag__count">{{ tag.count }}</span>
        </button>
      </div>

      <div class="tag-preview-feed" @dragend="drag.resetDragState(false)">
        <div class="tag-preview-feed__header">
          <span>{{ selectedTags.size ? t('workspace.sidebarPreview.selectedTitle') : t('workspace.sidebarPreview.allNotesTitle') }}</span>
          <button v-if="selectedTags.size" type="button" class="tag-preview-clear" @click="clearSelectedTags">
            {{ t('workspace.sidebarPreview.clear') }}
          </button>
        </div>

        <div
          v-for="preview in filteredNotePreviews"
          :key="preview.noteId"
          class="tag-preview-card"
          :class="{
            'tag-preview-card--active': activeNoteId === preview.noteId,
            'tag-preview-card--dragging': drag.draggedSource.value?.id === preview.noteId,
            'tag-preview-card--drag-over': drag.dragOver.value?.id === preview.noteId && drag.draggedSource.value?.id !== preview.noteId,
          }"
          :draggable="tagPreviewDragEnabled ? true : undefined"
          @contextmenu.prevent="onPreviewContextMenu($event, preview)"
          @dragstart="onPreviewDragStart($event, preview)"
          @dragover="onPreviewDragOver($event, preview)"
          @dragenter="onPreviewDragEnter(preview)"
          @dragleave="onPreviewDragLeave(preview)"
          @drop.prevent="onPreviewDrop($event, preview)"
        >
          <button
            type="button"
            class="tag-preview-card__open"
            draggable="false"
            @click="onPreviewCardClick(preview)"
          >
            <span class="tag-preview-card__icon"><NvNoteIcon :value="preview.icon" :size="15" /></span>
            <span class="tag-preview-card__main">
              <span class="tag-preview-card__top">
                <span class="tag-preview-card__title">{{ preview.title }}</span>
                <span class="tag-preview-card__date">{{ formatPreviewDate(preview.updatedAt) }}</span>
              </span>
              <span v-if="preview.folderPath" class="tag-preview-card__path">{{ preview.folderPath }}</span>
              <span class="tag-preview-card__text">{{ preview.previewText || t('workspace.sidebarPreview.emptyPreview') }}</span>
              <span class="tag-preview-card__tags">
                <span v-for="tag in preview.tags" :key="`${preview.noteId}-${tag}`" class="tag-preview-card__tag">{{ tag }}</span>
              </span>
            </span>
          </button>
          <button
            type="button"
            class="tag-preview-card__menu"
            :aria-label="t('workspace.context.openNoteMenu')"
            :title="t('workspace.context.openNoteMenu')"
            @click.stop="onPreviewContextMenu($event, preview)"
          >
            <MoreHorizontal :size="14" />
          </button>
        </div>

        <div v-if="tagPreviewEmptyKind" class="tag-preview-empty">
          <div class="tag-preview-empty__title">{{ t(`workspace.sidebarPreview.empty.${tagPreviewEmptyKind}.title`) }}</div>
          <div class="tag-preview-empty__subtitle">{{ t(`workspace.sidebarPreview.empty.${tagPreviewEmptyKind}.subtitle`) }}</div>
        </div>
      </div>
    </div>

    <div v-if="kanbanEnabled !== false" class="sidebar-boards">
      <div class="sidebar-boards__header">
        <span class="sidebar-boards__label">{{ t('workspace.boards.title') }}</span>
        <button type="button" class="nv-btn sidebar-boards__add" :title="t('workspace.boards.new')" :aria-label="t('workspace.boards.new')" @click="emit('create-board')">
          <Plus :size="12" />
        </button>
      </div>
      <button
        v-for="board in boards"
        :key="board.id"
        type="button"
        class="sidebar-board-item"
        :class="{ 'sidebar-board-item--active': activeBoardId === board.id }"
        @click="emit('open-board', board.id)"
        @contextmenu.prevent="onBoardContextMenu($event, board)"
      >
        <span class="sidebar-board-item__icon">{{ board.icon }}</span>
        <span class="sidebar-board-item__title">{{ board.title }}</span>
      </button>
      <button
        v-if="!boards?.length"
        type="button"
        class="sidebar-board-empty"
        @click="emit('create-board')"
      >
        <span class="sidebar-board-empty__icon"><Kanban :size="14" /></span>
        <span class="sidebar-board-empty__copy">
          <span class="sidebar-board-empty__title">{{ t('workspace.boards.emptyTitle') }}</span>
          <span class="sidebar-board-empty__subtitle">{{ t('workspace.boards.emptySubtitle') }}</span>
        </span>
        <span class="sidebar-board-empty__cta">{{ t('workspace.boards.new') }}</span>
      </button>
    </div>

    <div class="sidebar-system">
      <button type="button" class="sidebar-system__item" :class="{ 'sidebar-system__item--active': isGraphActive }" @click="emit('open-graph')">
        <Network :size="14" />
        <span>{{ t('workspace.system.graph') }}</span>
      </button>
      <button type="button" class="sidebar-system__item" @click="emit('open-history')">
        <History :size="14" />
        <span>{{ t('workspace.system.history') }}</span>
      </button>
      <button type="button" class="sidebar-system__item" @click="emit('open-trash')">
        <Trash2 :size="14" />
        <span>{{ t('workspace.system.trash') }}</span>
      </button>
      <button type="button" class="sidebar-system__item" @click="emit('open-settings')">
        <Settings :size="14" />
        <span>{{ t('workspace.system.settings') }}</span>
      </button>
    </div>
  </aside>

  <NvPopupMenu v-model:open="contextMenu.open" :position="cursorPos" width="200px">
    <NvMenuItem :icon="FolderPen" :label="t('workspace.context.rename')" @select="runContextAction('rename')" />
    <NvMenuItem :icon="Trash2" :label="t('workspace.context.delete')" danger @select="runContextAction('delete')" />
    <NvMenuSeparator />
    <NvMenuItem :icon="Search" :label="t('workspace.context.search')" @select="runContextAction('search')" />
    <NvMenuItem v-if="contextMenu.target?.kind === 'folder'" :icon="Upload" :label="t('workspace.context.importAsNote')" @select="runImportIntoFolder" />
    <NvMenuItem v-if="contextMenu.target?.kind === 'note'" :icon="Upload" :label="t('workspace.context.importIntoNote')" @select="runImportIntoNote" />
    <NvMenuItem v-if="contextMenu.target?.kind === 'note'" :icon="History" :label="t('workspace.system.history')" @select="runContextAction('history')" />
    <NvMenuItem v-if="contextMenu.target?.kind === 'note'" :icon="Download" :label="t('workspace.context.export')" :items="exportMenuItems" />
  </NvPopupMenu>

  <NvPopupMenu v-model:open="boardContextMenu.open" :position="boardCursorPos" width="180px">
    <NvMenuItem :icon="FolderPen" :label="t('workspace.context.rename')" @select="runBoardAction('rename')" />
    <NvMenuSeparator />
    <NvMenuItem :icon="Trash2" :label="t('workspace.context.delete')" danger @select="runBoardAction('delete')" />
  </NvPopupMenu>
</template>
