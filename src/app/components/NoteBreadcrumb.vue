<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { ChevronRight, PanelRight } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
import { useWorkspaceStore } from '../../stores/workspace'
import { useTreeStore } from '../../stores/tree'
import { useNoteStore } from '../../stores/note'
import { useUiStore } from '../../stores/ui'
import { useDeviceLayout } from '../../composables/useDeviceLayout'
import type { NoteDocument } from '../../types/note'

const props = defineProps<{ note: NoteDocument | null }>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const treeStore = useTreeStore()
const uiStore = useUiStore()
const { isDirty } = storeToRefs(useNoteStore())
const { rightPanelOpen } = storeToRefs(uiStore)
const { useDrawerNavigation } = useDeviceLayout()

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
  <div v-if="trail.length" class="breadcrumb-strip tw:flex tw:min-h-[50px] tw:min-w-0 tw:shrink-0 tw:items-center tw:gap-3 tw:overflow-hidden tw:border-x-0 tw:border-t-0 tw:border-b tw:border-solid tw:border-b-(--border-subtle) tw:bg-(--workspace-toolbar-surface) tw:px-6 tw:py-2 tw:text-[13px] tw:text-content-muted">
    <div class="breadcrumb-strip__trail tw:flex tw:min-w-0 tw:flex-1 tw:items-center tw:gap-0.5 tw:overflow-hidden">
      <template v-for="(item, i) in trail" :key="i">
        <ChevronRight v-if="i > 0" :size="11" class="breadcrumb-chevron tw:shrink-0 tw:text-content-muted" aria-hidden="true" />
        <span
          class="breadcrumb-item tw:inline-flex tw:min-w-0 tw:items-center tw:gap-[5px] tw:rounded-[calc(5px*var(--radius-scale,1))] tw:px-1.5 tw:py-0.5 tw:whitespace-nowrap tw:transition-colors tw:duration-100 tw:hover:bg-(--hover)"
          :class="i === trail.length - 1 ? 'breadcrumb-item--active tw:shrink-0 tw:text-content-secondary' : 'tw:shrink tw:text-content-muted'"
        >
          <NvNoteIcon :value="item.icon" :size="12" class="breadcrumb-icon tw:shrink-0 tw:text-[11.5px] tw:leading-none" />
          <span class="breadcrumb-label tw:truncate">{{ item.label }}</span>
          <span v-if="i === trail.length - 1 && isDirty" class="breadcrumb-dirty tw:mb-px tw:inline-block tw:size-[5px] tw:shrink-0 tw:rounded-full tw:bg-accent" aria-hidden="true" />
        </span>
      </template>
    </div>

    <div class="breadcrumb-strip__actions tw:flex tw:shrink-0 tw:items-center tw:justify-end tw:gap-1.5">
      <button
        v-if="!useDrawerNavigation"
        type="button"
        class="nv-btn workspace-sidebar-toggle tw:min-w-7 tw:px-2 tw:opacity-70 tw:transition-opacity tw:duration-150 tw:hover:opacity-100 tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
        :title="t('workspace.toggleRightPanel')"
        :class="{ 'workspace-sidebar-toggle--collapsed': !rightPanelOpen }"
        @click="uiStore.toggleRightPanel()"
      >
        <PanelRight :size="15" />
      </button>
      <slot name="actions" />
    </div>
  </div>
</template>
