<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { ArrowLeft, Download, FolderPen, History, Kanban, Network, Plus, Search, Settings, Trash2, Upload } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import type { TreeNode } from '../../types/note'
import type { KanbanBoardMeta } from '../../types/kanban'
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

const sortMode = computed<SortMode>(() => workspaceStore.settings.workspace.sidebarSortMode)
const showEmptyFolders = computed(() => workspaceStore.settings.workspace.showEmptyFolders)
const sortedTree = computed(() => {
  const sorted = sortTree(props.tree, sortMode.value)
  return filterTree(sorted, showEmptyFolders.value)
})
const collapseState = computed<'collapsed' | 'expanded'>(() =>
  collectFolderIds(props.tree).some((id) => collapsedFolders[id]) ? 'collapsed' : 'expanded',
)

function onSortModeChange(mode: SortMode) {
  workspaceStore.updateSettings((draft) => {
    draft.workspace.sidebarSortMode = mode
  })
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
  <aside class="sidebar">
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

    <div class="tree-wrap">
      <div v-if="isTreeEmpty" class="tree-empty">{{ t('workspace.noPages') }}</div>

      <WorkspaceTreeNode
        v-for="node in sortedTree"
        :key="node.meta.id"
        :node="node"
        :depth="0"
        :active-note-id="activeNoteId"
        :active-folder-id="activeFolderId"
        :collapsed-folders="collapsedFolders"
        @toggle-folder="onToggleFolder"
        @open-folder="emit('open-folder', $event)"
        @open-note="emit('open-note', $event)"
        @create-note-in-folder="emit('create-note-in-folder', $event)"
        @context-menu="onContextMenu"
      />
    </div>

    <div v-if="kanbanEnabled !== false && (boards?.length || true)" class="sidebar-boards">
      <div class="sidebar-boards__header">
        <span class="sidebar-boards__label">Boards</span>
        <button type="button" class="nv-btn sidebar-boards__add" title="New board" @click="emit('create-board')">
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
        class="sidebar-board-item sidebar-board-item--empty"
        @click="emit('create-board')"
      >
        <Kanban :size="12" />
        <span>New board</span>
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
