<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight } from 'lucide-vue-next'
import type { TreeNode } from '../../types/note'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'

interface Props {
  node: TreeNode
  depth: number
  activeNoteId: string | null
  activeFolderId: string | null
  collapsedFolders: Record<string, boolean>
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
}>()

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
</script>

<template>
  <div class="tree-node">
    <div
      v-if="isFolder && folder"
      class="tree-row"
      :class="{ 'tree-row--active': isActive }"
      :style="{ paddingLeft: `${8 + depth * 14}px` }"
      role="button"
      tabindex="0"
      @click="onFolderClick"
      @keydown.enter.prevent="onFolderClick"
      @keydown.space.prevent="onFolderClick"
      @contextmenu="onContextMenu"
    >
      <span class="tree-arrow" @click.stop="toggleFolder">
        <ChevronRight :size="12" :style="{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }" />
      </span>
      <NvNoteIcon :value="folder.icon || '📁'" :size="14" class="tree-note-emoji" />
      <span class="tree-title">{{ folder.title }}</span>
      <button type="button" class="tree-folder-add" @click="createInFolder">
        +
      </button>
    </div>

    <div
      v-else-if="note"
      class="tree-row"
      :class="{ 'tree-row--active': isActive }"
      :style="{ paddingLeft: `${22 + depth * 14}px` }"
      role="button"
      tabindex="0"
      @click="onNoteClick"
      @keydown.enter.prevent="onNoteClick"
      @keydown.space.prevent="onNoteClick"
      @contextmenu="onContextMenu"
    >
      <NvNoteIcon :value="note.icon || '📄'" :size="14" class="tree-note-emoji" />
      <span class="tree-title">{{ note.title }}</span>
    </div>

    <div v-if="isFolder && !isCollapsed" class="tree-children">
      <WorkspaceTreeNode
        v-for="child in children"
        :key="child.meta.id"
        :node="child"
        :depth="depth + 1"
        :active-note-id="activeNoteId"
        :active-folder-id="activeFolderId"
        :collapsed-folders="collapsedFolders"
        @toggle-folder="emit('toggle-folder', $event)"
        @open-folder="emit('open-folder', $event)"
        @open-note="emit('open-note', $event)"
        @create-note-in-folder="emit('create-note-in-folder', $event)"
        @context-menu="emit('context-menu', $event)"
      />
    </div>
  </div>
</template>
