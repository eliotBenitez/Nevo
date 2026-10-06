<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, Plus } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { TreeNode } from '../../types/note'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
import { folderNoteCount } from '../../utils/folder-note-count'
import type {
  SidebarDragOver,
  SidebarDragSource,
  SidebarDragTarget,
} from '../composables/useSidebarDrag'

interface Props {
  node: TreeNode
  depth: number
  activeNoteId: string | null
  activeFolderId: string | null
  collapsedFolders: Record<string, boolean>
  /** DnD включён (режим дерева). */
  dragEnabled?: boolean
  /** id перетаскиваемого сейчас элемента (или null). */
  draggedId?: string | null
  /** Текущая цель наведения перетаскивания (или null). */
  dragOver?: SidebarDragOver | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
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
  'drag-start': [event: DragEvent, source: SidebarDragSource]
  'drag-over': [target: SidebarDragTarget, isFolderTarget: boolean, event: DragEvent]
  'drag-enter': [targetId: string]
  'drag-leave': [targetId: string]
  'drop': [event: DragEvent, target: SidebarDragTarget]
}>()

const { t } = useI18n()

const isFolder = computed(() => props.node.kind === 'folder')
const folder = computed(() => props.node.kind === 'folder' ? props.node.meta : null)
const note = computed(() => props.node.kind === 'note' ? props.node.meta : null)

const isCollapsed = computed(() => {
  if (!folder.value) return false
  return !!props.collapsedFolders[folder.value.id]
})

const isActive = computed(() => {
  if (note.value) return props.activeNoteId === note.value.id
  if (folder.value) return props.activeFolderId === folder.value.id
  return false
})

const currentId = computed(() => folder.value?.id ?? note.value?.id ?? '')

const noteCount = computed(() => folder.value ? folderNoteCount(folder.value) : 0)

const isDragging = computed(() => props.draggedId === currentId.value)

const dragOverPosition = computed(() => {
  const over = props.dragOver
  if (!over || over.id !== currentId.value || isDragging.value) return null
  return over.position
})

const children = computed<TreeNode[]>(() => {
  if (!folder.value) return []
  const nodes: TreeNode[] = []
  for (const childFolder of folder.value.children) {
    nodes.push({ kind: 'folder', meta: childFolder })
  }
  for (const childNote of folder.value.notes) {
    nodes.push({ kind: 'note', meta: childNote })
  }
  return nodes
})

function onFolderClick() {
  if (!folder.value) return
  if (props.dragEnabled && props.draggedId) return
  emit('open-folder', folder.value.id)
}

function onNoteClick() {
  if (!note.value) return
  emit('open-note', note.value.id)
}

function toggleFolder() {
  if (!folder.value) return
  emit('toggle-folder', folder.value.id)
}

function onContextMenu(event: MouseEvent) {
  event.preventDefault()
  if (folder.value) {
    emit('context-menu', {
      kind: 'folder',
      id: folder.value.id,
      title: folder.value.title,
      folderId: folder.value.parentId,
      x: event.clientX,
      y: event.clientY,
    })
    return
  }
  if (note.value) {
    emit('context-menu', {
      kind: 'note',
      id: note.value.id,
      title: note.value.title,
      folderId: note.value.folderId,
      x: event.clientX,
      y: event.clientY,
    })
  }
}

function createInFolder(event: MouseEvent) {
  event.stopPropagation()
  if (!folder.value) return
  emit('create-note-in-folder', folder.value.id)
}

function buildSource(): SidebarDragSource {
  if (isFolder.value && folder.value) {
    return { id: folder.value.id, kind: 'folder', parentId: folder.value.parentId }
  }
  if (note.value) {
    return { id: note.value.id, kind: 'note', parentId: note.value.folderId }
  }
  return { id: currentId.value, kind: 'note', parentId: null }
}

function buildTarget(): SidebarDragTarget {
  if (isFolder.value && folder.value) {
    return { id: folder.value.id, kind: 'folder', parentId: folder.value.parentId }
  }
  if (note.value) {
    return { id: note.value.id, kind: 'note', parentId: note.value.folderId }
  }
  return { id: currentId.value, kind: 'note', parentId: null }
}

function onDragStart(event: DragEvent) {
  if (!props.dragEnabled) {
    event.preventDefault()
    return
  }
  emit('drag-start', event, buildSource())
}

function onDragOver(event: DragEvent) {
  if (!props.dragEnabled) return
  emit('drag-over', buildTarget(), isFolder.value, event)
}

function onDragEnter() {
  if (!props.dragEnabled) return
  emit('drag-enter', currentId.value)
}

function onDragLeave() {
  if (!props.dragEnabled) return
  emit('drag-leave', currentId.value)
}

function onDrop(event: DragEvent) {
  if (!props.dragEnabled) return
  event.preventDefault()
  emit('drop', event, buildTarget())
}
</script>

<template>
  <div class="tree-node">
    <div
      v-if="isFolder && folder"
      class="tree-row tw:w-full tw:border-0 tw:bg-transparent tw:text-content-secondary tw:h-[30px] tw:rounded-[calc(12px*var(--radius-scale,1))] tw:flex tw:items-center tw:gap-2 tw:text-[13px] tw:cursor-pointer tw:pr-2.5 tw:relative tw:transition-[background,color] tw:duration-[120ms]"
      :class="{
        'tree-row--active': isActive,
        'tree-row--dragging': isDragging,
        'tree-row--drag-over': dragOverPosition !== null,
        'tree-row--drop-into': dragOverPosition === 'into',
        'tree-row--drop-before': dragOverPosition === 'before',
        'tree-row--drop-after': dragOverPosition === 'after',
      }"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
      role="button"
      tabindex="0"
      :draggable="dragEnabled ? true : undefined"
      @click="onFolderClick"
      @keydown.enter.prevent="onFolderClick"
      @keydown.space.prevent="onFolderClick"
      @contextmenu="onContextMenu"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <span class="tree-drop-line tree-drop-line--top tw:absolute tw:left-1.5 tw:right-1.5 tw:h-0 tw:rounded-[calc(2px*var(--radius-scale,1))] tw:pointer-events-none tw:transition-[height,opacity,background,box-shadow] tw:duration-100 tw:-top-0.5" aria-hidden="true" />
      <span class="tree-arrow tw:w-3 tw:h-3 tw:grid tw:place-items-center tw:text-content-muted" @click.stop="toggleFolder">
        <ChevronRight :size="12" :style="{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }" />
      </span>
      <NvNoteIcon :value="folder.icon || '📁'" :size="14" class="tree-note-emoji tw:w-[18px] tw:inline-flex tw:justify-center tw:flex-none tw:leading-none" />
      <span class="tree-title tw:flex-1 tw:min-w-0 tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis tw:text-left">{{ folder.title }}</span>
      <span v-if="noteCount > 0" class="tree-folder-count tw:flex-none tw:text-content-muted tw:text-[11px] tw:[font-variant-numeric:tabular-nums] tw:text-right">{{ noteCount }}</span>
      <button
        type="button"
        class="tree-folder-add tw:w-5 tw:h-5 tw:p-0 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:text-content-muted tw:grid tw:place-items-center tw:cursor-pointer tw:opacity-0 tw:transition-[opacity,background,color] tw:duration-[120ms]"
        draggable="false"
        :title="t('workspace.actions.newNote')"
        :aria-label="t('workspace.actions.newNote')"
        @click="createInFolder"
      >
        <Plus :size="12" aria-hidden="true" />
      </button>
      <span class="tree-drop-line tree-drop-line--bottom tw:absolute tw:left-1.5 tw:right-1.5 tw:h-0 tw:rounded-[calc(2px*var(--radius-scale,1))] tw:pointer-events-none tw:transition-[height,opacity,background,box-shadow] tw:duration-100 tw:-bottom-0.5" aria-hidden="true" />
    </div>

    <div
      v-else-if="note"
      class="tree-row tw:w-full tw:border-0 tw:bg-transparent tw:text-content-secondary tw:h-[30px] tw:rounded-[calc(12px*var(--radius-scale,1))] tw:flex tw:items-center tw:gap-2 tw:text-[13px] tw:cursor-pointer tw:pr-2.5 tw:relative tw:transition-[background,color] tw:duration-[120ms]"
      :class="{
        'tree-row--active': isActive,
        'tree-row--dragging': isDragging,
        'tree-row--drag-over': dragOverPosition !== null,
        'tree-row--drop-before': dragOverPosition === 'before',
        'tree-row--drop-after': dragOverPosition === 'after',
      }"
      :style="{ paddingLeft: `${22 + depth * 14}px` }"
      role="button"
      tabindex="0"
      :draggable="dragEnabled ? true : undefined"
      @click="onNoteClick"
      @keydown.enter.prevent="onNoteClick"
      @keydown.space.prevent="onNoteClick"
      @contextmenu="onContextMenu"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <span class="tree-drop-line tree-drop-line--top tw:absolute tw:left-1.5 tw:right-1.5 tw:h-0 tw:rounded-[calc(2px*var(--radius-scale,1))] tw:pointer-events-none tw:transition-[height,opacity,background,box-shadow] tw:duration-100 tw:-top-0.5" aria-hidden="true" />
      <NvNoteIcon :value="note.icon || '📄'" :size="14" class="tree-note-emoji tw:w-[18px] tw:inline-flex tw:justify-center tw:flex-none tw:leading-none" />
      <span class="tree-title tw:flex-1 tw:min-w-0 tw:whitespace-nowrap tw:overflow-hidden tw:text-ellipsis tw:text-left">{{ note.title }}</span>
      <span class="tree-drop-line tree-drop-line--bottom tw:absolute tw:left-1.5 tw:right-1.5 tw:h-0 tw:rounded-[calc(2px*var(--radius-scale,1))] tw:pointer-events-none tw:transition-[height,opacity,background,box-shadow] tw:duration-100 tw:-bottom-0.5" aria-hidden="true" />
    </div>

    <div v-if="isFolder && !isCollapsed" class="tree-children tw:flex tw:flex-col tw:gap-0.5 tw:mt-0.5">
      <WorkspaceTreeNode
        v-for="child in children"
        :key="child.meta.id"
        :node="child"
        :depth="depth + 1"
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
        @drag-start="(event, source) => emit('drag-start', event, source)"
        @drag-over="(target, isFolder, event) => emit('drag-over', target, isFolder, event)"
        @drag-enter="emit('drag-enter', $event)"
        @drag-leave="emit('drag-leave', $event)"
        @drop="(event, target) => emit('drop', event, target)"
      />
    </div>
  </div>
</template>
