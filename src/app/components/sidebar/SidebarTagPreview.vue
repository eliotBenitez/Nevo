<script setup lang="ts">
import { MoreHorizontal, Tag } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import type { SidebarNotePreview } from '../../../types/note'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import { pluralChoice } from '../../../utils/plural-index'
import { notebookPreviewSummary } from '../../../utils/sidebar/sidebarNotePreviews'

interface TagStat {
  label: string
  count: number
}

export interface SidebarTagPreviewItem extends SidebarNotePreview {
  formattedDate: string
}

interface Props {
  tagStats: TagStat[]
  selectedTags: Set<string>
  previews: SidebarTagPreviewItem[]
  activeNoteId: string | null
  dragEnabled: boolean
  draggedId: string | null
  dragOverId: string | null
  emptyKind: 'no-notes' | 'no-matches' | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'toggle-tag': [tag: string]
  'clear-tags': []
  'card-click': [preview: SidebarTagPreviewItem]
  'preview-contextmenu': [event: MouseEvent, preview: SidebarTagPreviewItem]
  'drag-start': [event: DragEvent, preview: SidebarTagPreviewItem]
  'drag-over': [event: DragEvent, preview: SidebarTagPreviewItem]
  'drag-enter': [preview: SidebarTagPreviewItem]
  'drag-leave': [preview: SidebarTagPreviewItem]
  'drop': [event: DragEvent, preview: SidebarTagPreviewItem]
  'dragend': []
}>()

const { t, locale } = useI18n()

function previewLine(preview: SidebarTagPreviewItem): string {
  if (preview.previewText) return preview.previewText
  return notebookPreviewSummary(preview, t, count => pluralChoice(String(locale.value), count))
    || t('workspace.sidebarPreview.emptyPreview')
}

function isTagSelected(tag: string) {
  return props.selectedTags.has(tag.toLowerCase())
}
</script>

<template>
  <div class="tag-preview-wrap tw:min-h-0 tw:flex-1 tw:grid tw:grid-cols-[128px_minmax(0,1fr)] tw:gap-2">
    <div class="tag-preview-tags tw:min-h-0 tw:overflow-auto tw:overscroll-contain tw:[contain:paint] tw:flex tw:flex-col tw:gap-1 tw:pr-0.5" :aria-label="t('workspace.sidebarPreview.tagsLabel')">
      <button
        v-for="tag in tagStats"
        :key="tag.label"
        type="button"
        class="tag-preview-tag tw:w-full tw:min-h-[28px] tw:border tw:border-solid tw:border-transparent tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:grid tw:grid-cols-[12px_minmax(0,1fr)_auto] tw:items-center tw:gap-1.5 tw:px-[7px] tw:text-[11.5px] tw:text-left tw:transition-[background-color,border-color,color] tw:duration-[140ms] tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
        :class="{ 'tag-preview-tag--active': isTagSelected(tag.label) }"
        @click="emit('toggle-tag', tag.label)"
      >
        <Tag :size="11" />
        <span class="tag-preview-tag__label tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ tag.label }}</span>
        <span class="tag-preview-tag__count tw:min-w-[18px] tw:h-[18px] tw:rounded-full tw:grid tw:place-items-center tw:px-[5px] tw:bg-[color-mix(in_oklab,var(--surface-overlay)_82%,transparent)] tw:text-content-muted tw:text-[10.5px] tw:font-[650] tw:[font-variant-numeric:tabular-nums]">{{ tag.count }}</span>
      </button>
    </div>

    <div class="tag-preview-feed tw:min-h-0 tw:overflow-auto tw:overscroll-contain tw:[contain:paint] tw:flex tw:flex-col tw:gap-1.5" @dragend="emit('dragend')">
      <div class="tag-preview-feed__header tw:min-h-[26px] tw:flex tw:items-center tw:gap-2 tw:text-content-muted tw:text-[10.5px] tw:font-[650] tw:uppercase tw:tracking-[0.04em]">
        <span>{{ selectedTags.size ? t('workspace.sidebarPreview.selectedTitle') : t('workspace.sidebarPreview.allNotesTitle') }}</span>
        <button
          v-if="selectedTags.size"
          type="button"
          class="tag-preview-clear tw:ml-auto tw:border-none tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-transparent tw:text-accent tw:cursor-pointer tw:text-[11px] tw:font-[650] tw:py-1 tw:px-1.5 tw:hover:bg-(--hover) tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
          @click="emit('clear-tags')"
        >
          {{ t('workspace.sidebarPreview.clear') }}
        </button>
      </div>

      <div
        v-for="preview in previews"
        :key="preview.noteId"
        class="tag-preview-card tw:w-full tw:border tw:border-solid tw:border-(--border-subtle) tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-[color-mix(in_oklab,var(--surface-raised)_80%,transparent)] tw:text-content-secondary tw:cursor-pointer tw:grid tw:grid-cols-[24px_minmax(0,1fr)_24px] tw:gap-2 tw:p-[9px] tw:text-left tw:transition-[background-color,border-color,color] tw:duration-[140ms] tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
        :class="{
          'tag-preview-card--active': activeNoteId === preview.noteId,
          'tag-preview-card--dragging': draggedId === preview.noteId,
          'tag-preview-card--drag-over': dragOverId === preview.noteId && draggedId !== preview.noteId,
        }"
        :draggable="dragEnabled ? true : undefined"
        @contextmenu.prevent="emit('preview-contextmenu', $event, preview)"
        @dragstart="emit('drag-start', $event, preview)"
        @dragover="emit('drag-over', $event, preview)"
        @dragenter="emit('drag-enter', preview)"
        @dragleave="emit('drag-leave', preview)"
        @drop.prevent="emit('drop', $event, preview)"
      >
        <button
          type="button"
          class="tag-preview-card__open tw:min-w-0 tw:[grid-column:1/3] tw:border-none tw:bg-transparent tw:text-inherit tw:cursor-pointer tw:grid tw:grid-cols-[24px_minmax(0,1fr)] tw:gap-2 tw:p-0 tw:text-left tw:focus-visible:outline-none"
          draggable="false"
          @click="emit('card-click', preview)"
        >
          <span class="tag-preview-card__icon tw:w-6 tw:h-6 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:grid tw:place-items-center tw:bg-(--accent-soft)"><NvNoteIcon :value="preview.icon" :size="15" /></span>
          <span class="tag-preview-card__main tw:min-w-0 tw:flex tw:flex-col tw:gap-1">
            <span class="tag-preview-card__top tw:min-w-0 tw:flex tw:items-baseline tw:gap-2">
              <span class="tag-preview-card__title tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-content-primary tw:text-[12.5px] tw:font-[650]">{{ preview.title }}</span>
              <span class="tag-preview-card__date tw:shrink-0 tw:text-content-muted tw:text-[10.5px]">{{ preview.formattedDate }}</span>
            </span>
            <span v-if="preview.folderPath" class="tag-preview-card__path tw:overflow-hidden tw:[display:-webkit-box] tw:[-webkit-box-orient:vertical] tw:[-webkit-line-clamp:1] tw:text-content-muted tw:text-[10.5px]">{{ preview.folderPath }}</span>
            <span class="tag-preview-card__text tw:overflow-hidden tw:[display:-webkit-box] tw:[-webkit-box-orient:vertical] tw:[-webkit-line-clamp:2] tw:text-content-muted tw:text-[11.5px] tw:leading-[1.35]">{{ previewLine(preview) }}</span>
            <span class="tag-preview-card__tags tw:min-w-0 tw:flex tw:flex-wrap tw:gap-1">
              <span v-for="tag in preview.tags" :key="`${preview.noteId}-${tag}`" class="tag-preview-card__tag tw:max-w-full tw:rounded-full tw:bg-[color-mix(in_oklab,var(--accent)_11%,transparent)] tw:text-accent tw:text-[10.5px] tw:font-[620] tw:py-0.5 tw:px-1.5 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap">{{ tag }}</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          class="tag-preview-card__menu tw:w-6 tw:h-6 tw:border-none tw:rounded-[calc(7px*var(--radius-scale,1))] tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:grid tw:place-items-center tw:opacity-0 tw:transition-[opacity,background-color,color] tw:duration-[140ms]"
          :aria-label="t('workspace.context.openNoteMenu')"
          :title="t('workspace.context.openNoteMenu')"
          @click.stop="emit('preview-contextmenu', $event, preview)"
        >
          <MoreHorizontal :size="14" />
        </button>
      </div>

      <div v-if="emptyKind" class="tag-preview-empty tw:border tw:border-dashed tw:border-(--border-subtle) tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-[color-mix(in_oklab,var(--surface-raised)_72%,transparent)] tw:p-[12px_10px]">
        <div class="tag-preview-empty__title tw:text-content-secondary tw:text-xs tw:font-[650]">{{ t(`workspace.sidebarPreview.empty.${emptyKind}.title`) }}</div>
        <div class="tag-preview-empty__subtitle tw:mt-1 tw:text-content-muted tw:text-[11.5px] tw:leading-[1.4]">{{ t(`workspace.sidebarPreview.empty.${emptyKind}.subtitle`) }}</div>
      </div>
    </div>
  </div>
</template>
