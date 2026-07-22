<script setup lang="ts">
import { computed, markRaw, ref } from 'vue'
import type { Component } from 'vue'
import {
  ArrowDownAZ, ArrowDownUp, ArrowDownZA, ChevronDown, ChevronsDownUp, ChevronsUpDown,
  ArchiveRestore, Clock, FileText, FileUp, FolderInput, FolderPlus, Kanban, List, Plus, Upload,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import NvPopupMenu from '../../ui/primitives/NvPopupMenu.vue'
import type { NvMenuItemDef } from '../../ui/primitives/menu-types'
import type { SortMode } from '../composables/useSidebarTree'

import { useWorkspaceStore } from '../../stores/workspace'
import { resolveBindingChord } from '../../utils/workspace-settings'

interface Props {
  kanbanEnabled?: boolean
  collapseState: 'collapsed' | 'expanded'
  sortMode: SortMode
  backendKind?: 'local' | 'cloud' | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'create-note': []
  'create-folder': []
  'create-board': []
  'import-md': []
  'import-obsidian': []
  'import-notion': []
  'toggle-collapse-all': []
  'update:sortMode': [mode: SortMode]
}>()

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()

const newNoteShortcut = computed(() => {
  const b = workspaceStore.settings.hotkeys.bindings.find((x) => x.commandId === 'workspace.new-note')
  return b ? resolveBindingChord(b) : 'Ctrl+N'
})

const newFolderShortcut = computed(() => {
  const b = workspaceStore.settings.hotkeys.bindings.find((x) => x.commandId === 'workspace.new-folder')
  return b ? resolveBindingChord(b) : 'Ctrl+Shift+N'
})

const sortMenuOpen = ref(false)

const newMenuItems = computed<NvMenuItemDef[]>(() => {
  const items: NvMenuItemDef[] = [
    { label: t('workspace.actions.newNote'), icon: markRaw(FileText), shortcut: newNoteShortcut.value, action: () => emit('create-note') },
    { label: t('workspace.actions.newFolder'), icon: markRaw(FolderPlus), shortcut: newFolderShortcut.value, action: () => emit('create-folder') },
  ]

  if (props.kanbanEnabled !== false) {
    items.push({ label: t('workspace.actions.newBoard'), icon: markRaw(Kanban), action: () => emit('create-board') })
  }
  items.push({ type: 'separator' })
  items.push({
    label: t('workspace.importMenu'),
    icon: markRaw(Upload),
    items: [
      { label: t('workspace.importMd'), icon: markRaw(FileUp), action: () => emit('import-md') },
      { label: t('workspace.importObsidian'), icon: markRaw(FolderInput), action: () => emit('import-obsidian') },
      {
        label: props.backendKind === 'cloud' ? t('workspace.notionImport.localOnlyShort') : t('workspace.importNotion'),
        icon: markRaw(ArchiveRestore),
        disabled: props.backendKind !== 'local',
        action: () => emit('import-notion'),
      },
    ],
  })
  return items
})

const sortOptions: { mode: SortMode; label: string; icon: Component }[] = [
  { mode: 'manual', label: 'sortManual', icon: markRaw(List) },
  { mode: 'name-asc', label: 'sortNameAsc', icon: markRaw(ArrowDownAZ) },
  { mode: 'name-desc', label: 'sortNameDesc', icon: markRaw(ArrowDownZA) },
  { mode: 'updated', label: 'sortUpdated', icon: markRaw(Clock) },
]

const sortMenuItems = computed<NvMenuItemDef[]>(() =>
  sortOptions.map((opt) => ({
    label: t(`workspace.actions.${opt.label}`),
    icon: opt.icon,
    shortcut: props.sortMode === opt.mode ? '✓' : undefined,
    action: () => emit('update:sortMode', opt.mode),
  })),
)

const collapseIcon = computed(() => (props.collapseState === 'expanded' ? ChevronsDownUp : ChevronsUpDown))
const collapseTitle = computed(() =>
  props.collapseState === 'expanded' ? t('workspace.actions.collapseAll') : t('workspace.actions.expandAll'),
)
</script>

<template>
  <div class="sidebar-actionbar">
    <NvPopupMenu
      class="sidebar-actionbar__new-wrap"
      :items="newMenuItems"
      placement="bottom-start"
      width="194px"
    >
      <template #trigger>
        <button type="button" class="sidebar-actionbar__new" :title="t('workspace.actions.new')">
          <Plus :size="14" />
          <span>{{ t('workspace.actions.new') }}</span>
          <ChevronDown :size="13" class="sidebar-actionbar__caret" />
        </button>
      </template>
    </NvPopupMenu>

    <div class="sidebar-actionbar__tools">
      <button type="button" class="sidebar-actionbar__icon" :title="collapseTitle" @click="emit('toggle-collapse-all')">
        <component :is="collapseIcon" :size="15" />
      </button>

      <NvPopupMenu v-model:open="sortMenuOpen" :items="sortMenuItems" placement="bottom-end" width="184px">
        <template #trigger>
          <button
            type="button"
            class="sidebar-actionbar__icon"
            :class="{ 'is-active': sortMode !== 'manual' || sortMenuOpen }"
            :title="t('workspace.actions.sort')"
          >
            <ArrowDownUp :size="15" />
          </button>
        </template>
      </NvPopupMenu>
    </div>
  </div>
</template>
