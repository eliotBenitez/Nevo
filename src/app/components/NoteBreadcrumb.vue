<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { ChevronRight } from 'lucide-vue-next'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTreeStore } from '../../stores/tree'
import { useNoteStore } from '../../stores/note'
import type { NoteDocument } from '../../types/note'

const props = defineProps<{ note: NoteDocument | null }>()

const workspaceStore = useWorkspaceStore()
const treeStore = useTreeStore()
const { isDirty } = storeToRefs(useNoteStore())

interface BreadcrumbItem {
  icon: string
  label: string
}

const trail = computed<BreadcrumbItem[]>(() => {
  const manifest = workspaceStore.manifest
  if (!manifest || !props.note) return []

  const items: BreadcrumbItem[] = [{ icon: manifest.glyph || '🗂️', label: manifest.name }]

  if (props.note.folderId) {
    const chain: BreadcrumbItem[] = []
    let folderId: string | null = props.note.folderId
    while (folderId) {
      const folder = treeStore.folderById.get(folderId)
      if (!folder) break
      chain.unshift({ icon: folder.icon || '📁', label: folder.title })
      folderId = folder.parentId
    }
    items.push(...chain)
  }

  items.push({ icon: props.note.icon || '📄', label: props.note.title || 'Untitled' })
  return items
})
</script>

<template>
  <div v-if="trail.length" class="breadcrumb-strip">
    <div class="breadcrumb-strip__trail">
      <template v-for="(item, i) in trail" :key="i">
        <ChevronRight v-if="i > 0" :size="11" class="breadcrumb-chevron" aria-hidden="true" />
        <span
          class="breadcrumb-item"
          :class="{ 'breadcrumb-item--active': i === trail.length - 1 }"
        >
          <NvNoteIcon :value="item.icon" :size="12" class="breadcrumb-icon" />
          <span class="breadcrumb-label">{{ item.label }}</span>
          <span v-if="i === trail.length - 1 && isDirty" class="breadcrumb-dirty" aria-hidden="true" />
        </span>
      </template>
    </div>

    <div v-if="$slots.actions" class="breadcrumb-strip__actions">
      <slot name="actions" />
    </div>
  </div>
</template>
