<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../ui/primitives/NvNoteIcon.vue'
import type { TabEntry } from '../../stores/tabs'

const props = defineProps<{
  tabs: TabEntry[]
  activeTabId: string | null
}>()

const emit = defineEmits<{
  select: [noteId: string]
  close: [tabId: string]
  reorder: [fromIndex: number, toIndex: number]
}>()

const hoveredTabId = ref<string | null>(null)
const draggedTabId = ref<string | null>(null)
const dragOverTabId = ref<string | null>(null)
const lastReorderTargetId = ref<string | null>(null)
const suppressNextClick = ref(false)
const { t } = useI18n()
let clickSuppressTimer: ReturnType<typeof setTimeout> | null = null

function onTabClick(tab: TabEntry) {
  if (suppressNextClick.value) {
    suppressNextClick.value = false
    return
  }
  emit('select', tab.noteId)
}

function onClose(e: MouseEvent, tab: TabEntry) {
  e.stopPropagation()
  emit('close', tab.id)
}

function tabIndex(tabId: string) {
  return props.tabs.findIndex(tab => tab.id === tabId)
}

function suppressClickAfterDrag() {
  suppressNextClick.value = true
  if (clickSuppressTimer) clearTimeout(clickSuppressTimer)
  clickSuppressTimer = setTimeout(() => {
    suppressNextClick.value = false
    clickSuppressTimer = null
  }, 100)
}

function resetDragState(suppressClick = false) {
  draggedTabId.value = null
  dragOverTabId.value = null
  lastReorderTargetId.value = null
  if (suppressClick) suppressClickAfterDrag()
}

function reorderDraggedTab(targetTab: TabEntry) {
  if (!draggedTabId.value || draggedTabId.value === targetTab.id) return false

  const fromIndex = tabIndex(draggedTabId.value)
  const toIndex = tabIndex(targetTab.id)
  if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return false

  emit('reorder', fromIndex, toIndex)
  lastReorderTargetId.value = targetTab.id
  return true
}

function onDragStart(e: DragEvent, tab: TabEntry) {
  draggedTabId.value = tab.id
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tab.id)
  }
}

function onDragEnter(tab: TabEntry) {
  if (!draggedTabId.value) return
  dragOverTabId.value = tab.id
  if (lastReorderTargetId.value === tab.id) return
  reorderDraggedTab(tab)
}

function onDragLeave(tab: TabEntry) {
  if (dragOverTabId.value === tab.id) {
    dragOverTabId.value = null
  }
}

function onDrop(tab: TabEntry) {
  if (lastReorderTargetId.value !== tab.id) {
    reorderDraggedTab(tab)
  }
  resetDragState(true)
}

function onDragEnd() {
  resetDragState(true)
}

onBeforeUnmount(() => {
  if (clickSuppressTimer) clearTimeout(clickSuppressTimer)
})
</script>

<template>
  <div class="tabs-strip" role="tablist" :aria-label="t('workspace.tabs.label')" @dragover.prevent>
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="title-tab-wrap"
      :class="{
        'title-tab--active': tab.id === activeTabId,
        'title-tab--hovered': tab.id !== activeTabId && tab.id === hoveredTabId,
        'title-tab--pinned': tab.isPinned,
        'title-tab--dirty': tab.isDirty,
        'title-tab--dragging': tab.id === draggedTabId,
        'title-tab--drag-over': tab.id === dragOverTabId && tab.id !== draggedTabId,
      }"
      @mouseenter="hoveredTabId = tab.id"
      @mouseleave="hoveredTabId = null"
    >
      <button
        type="button"
        role="tab"
        class="title-tab"
        :title="tab.title"
        :aria-selected="tab.id === activeTabId"
        draggable="true"
        @click="onTabClick(tab)"
        @dragstart="onDragStart($event, tab)"
        @dragenter="onDragEnter(tab)"
        @dragleave="onDragLeave(tab)"
        @dragover.prevent
        @dragend="onDragEnd"
        @drop.prevent="onDrop(tab)"
      >
        <span class="tab-icon">
          <NvNoteIcon :value="tab.icon" :size="14" />
        </span>
        <span v-if="!tab.isPinned" class="tab-title">{{ tab.title }}</span>
      </button>
      <button
        v-if="!tab.isPinned"
        type="button"
        class="tab-close"
        draggable="false"
        :aria-label="t('workspace.tabs.close', { title: tab.title })"
        @click="onClose($event, tab)"
      >
        <X :size="10" />
      </button>
    </div>
  </div>
</template>
