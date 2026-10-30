<script setup lang="ts">
import { BookOpen, FolderPen, Plus } from '../../../ui/icons'
import { useI18n } from 'vue-i18n'
import type { TreeNode } from '../../../types/note'
import WorkspaceTreeNode from '../WorkspaceTreeNode.vue'
import type { SidebarDragOver, SidebarDragSource } from '../../composables/useSidebarDrag'

interface Props {
  tree: TreeNode[]
  isEmpty: boolean
  activeNoteId: string | null
  activeFolderId: string | null
  collapsedFolders: Record<string, boolean>
  dragEnabled: boolean
  draggedId: string | null
  dragOver: SidebarDragOver | null
  rootDropActive: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  'create-note': []
  'create-notebook': []
  'create-folder': []
  'toggle-folder': [folderId: string]
  'open-folder': [folderId: string]
  'open-note': [noteId: string]
  'create-note-in-folder': [folderId: string]
  'context-menu': [payload: {
    kind: 'folder' | 'note'
    id: string
    title: string
    folderId: string | null
    x: number
    y: number
  }]
  'drag-pointerdown': [event: PointerEvent, source: SidebarDragSource]
}>()

const { t } = useI18n()
</script>

<template>
  <div class="tree-wrap tw:min-h-0 tw:flex-1 tw:overflow-auto tw:overscroll-contain tw:flex tw:flex-col tw:gap-0.5 tw:[contain:paint]">
    <div v-if="isEmpty" class="tree-empty tw:p-[12px_10px] tw:border tw:border-dashed tw:border-(--border-subtle) tw:rounded-[calc(10px*var(--radius-scale,1))] tw:bg-[color-mix(in_oklab,var(--surface-raised)_72%,transparent)] tw:text-content-muted tw:text-xs">
      <div class="tree-empty__title tw:text-content-secondary tw:font-semibold">{{ t('workspace.emptyTree.title') }}</div>
      <div class="tree-empty__subtitle tw:mt-1 tw:leading-[1.4]">{{ t('workspace.emptyTree.subtitle') }}</div>
      <div class="tree-empty__actions tw:flex tw:gap-1.5 tw:mt-2.5 tw:flex-wrap">
        <button type="button" class="nv-btn nv-btn--primary" @click="emit('create-note')">
          <Plus :size="12" />
          <span>{{ t('workspace.actions.newNote') }}</span>
        </button>
        <button type="button" class="nv-btn" @click="emit('create-notebook')">
          <BookOpen :size="12" />
          <span>{{ t('app.notebook.create') }}</span>
        </button>
        <button type="button" class="nv-btn" @click="emit('create-folder')">
          <FolderPen :size="12" />
          <span>{{ t('workspace.actions.newFolder') }}</span>
        </button>
      </div>
    </div>

    <WorkspaceTreeNode
      v-for="node in tree"
      :key="node.meta.id"
      :node="node"
      :depth="0"
      :active-note-id="activeNoteId"
      :active-folder-id="activeFolderId"
      :collapsed-folders="collapsedFolders"
      :drag-enabled="dragEnabled"
      :dragged-id="draggedId"
      :drag-over="dragOver"
      @toggle-folder="emit('toggle-folder', $event)"
      @open-folder="emit('open-folder', $event)"
      @open-note="emit('open-note', $event)"
      @create-note-in-folder="emit('create-note-in-folder', $event)"
      @context-menu="emit('context-menu', $event)"
      @drag-pointerdown="(event, source) => emit('drag-pointerdown', event, source)"
    />

    <div
      class="tree-root-drop-zone tw:flex-[1_0_36px] tw:min-h-[36px] tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-dashed tw:transition-[background-color,border-color] tw:duration-[140ms]"
      :class="rootDropActive
        ? 'tree-root-drop-zone--active tw:bg-[color-mix(in_oklab,var(--accent)_9%,transparent)] tw:border-[color-mix(in_oklab,var(--accent)_36%,transparent)]'
        : 'tw:bg-transparent tw:border-transparent'"
      data-tree-root-drop
    />
  </div>
</template>
