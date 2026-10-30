<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { trackPointerDrag } from '../../utils/pointerDrag'
import { X } from '../../ui/icons'
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
const { t } = useI18n()

function onTabClick(tab: TabEntry) {
  emit('select', tab.noteId)
}

function onClose(e: MouseEvent, tab: TabEntry) {
  e.stopPropagation()
  emit('close', tab.id)
}

function tabIndex(tabId: string) {
  return props.tabs.findIndex(tab => tab.id === tabId)
}

// Pointer events instead of HTML5 DnD, which is unreliable in WebKitGTK.
let cancelDrag: (() => void) | null = null

function onTabPointerDown(event: PointerEvent, tab: TabEntry) {
  if (event.button !== 0 || event.isPrimary === false || cancelDrag) return
  const originIndex = tabIndex(tab.id)
  let lastTargetId: string | null = null
  cancelDrag = trackPointerDrag(event, {
    onStart: () => { draggedTabId.value = tab.id },
    onMove: (e) => {
      const overId = document.elementFromPoint?.(e.clientX, e.clientY)
        ?.closest<HTMLElement>('[data-tab-id]')?.dataset.tabId ?? null
      dragOverTabId.value = overId
      if (!overId || overId === tab.id || overId === lastTargetId) return
      const fromIndex = tabIndex(tab.id)
      const toIndex = tabIndex(overId)
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return
      lastTargetId = overId
      emit('reorder', fromIndex, toIndex)
    },
    onAbort: () => {
      const currentIndex = tabIndex(tab.id)
      if (currentIndex !== -1 && originIndex !== -1 && currentIndex !== originIndex) {
        emit('reorder', currentIndex, originIndex)
      }
    },
    onFinish: () => {
      cancelDrag = null
      draggedTabId.value = null
      dragOverTabId.value = null
    },
  })
}

onBeforeUnmount(() => cancelDrag?.())
</script>

<template>
  <div class="tabs-strip tw:flex tw:items-center tw:gap-[5px] tw:flex-1 tw:min-w-0 tw:px-1 tw:overflow-hidden" role="tablist" :aria-label="t('workspace.tabs.label')">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="title-tab-wrap tw:relative tw:min-w-0"
      :class="{
        'title-tab--active': tab.id === activeTabId,
        'title-tab--hovered': tab.id !== activeTabId && tab.id === hoveredTabId,
        'title-tab--pinned tw:max-w-8 tw:flex-none': tab.isPinned,
        'tw:max-w-[180px] tw:flex-[0_1_auto]': !tab.isPinned,
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
        class="title-tab tw:appearance-none tw:w-full tw:flex tw:items-center tw:justify-start tw:gap-1.5 tw:h-[30px] tw:pr-[30px] tw:pl-2.5 tw:py-0 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:text-[12.5px] tw:font-[450] tw:text-content-muted tw:bg-transparent tw:border tw:border-solid tw:border-transparent tw:cursor-pointer tw:select-none tw:transition-[background,color,box-shadow] tw:duration-150"
        :title="tab.title"
        :aria-selected="tab.id === activeTabId"
        :data-tab-id="tab.id"
        @click="onTabClick(tab)"
        @pointerdown="onTabPointerDown($event, tab)"
      >
        <span class="tab-icon tw:text-[13px] tw:leading-none tw:flex-none tw:flex tw:transition-colors tw:duration-150">
          <NvNoteIcon :value="tab.icon" :size="14" />
        </span>
        <span v-if="!tab.isPinned" class="tab-title tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:min-w-0 tw:flex-[0_1_auto]">{{ tab.title }}</span>
      </button>
      <button
        v-if="!tab.isPinned"
        type="button"
        class="tab-close tw:appearance-none tw:border-0 tw:grid tw:place-items-center tw:w-5 tw:h-5 tw:rounded-[calc(4px*var(--radius-scale,1))] tw:text-content-muted tw:bg-transparent tw:absolute tw:right-[5px] tw:top-1/2 tw:-mt-2.5 tw:opacity-0 tw:scale-[0.92] tw:pointer-events-none tw:cursor-pointer tw:[transition:opacity_150ms,transform_150ms,background_100ms,color_100ms]"
        :aria-label="t('workspace.tabs.close', { title: tab.title })"
        @click="onClose($event, tab)"
      >
        <X :size="10" />
      </button>
    </div>
  </div>
</template>
