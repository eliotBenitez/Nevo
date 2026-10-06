<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Folder, Inbox, RotateCcw, Trash2 } from '@lucide/vue'
import type { ArchiveItemViewModel } from '../../composables/useArchiveItems'
import type { HistoryComparableBlock } from '../../../utils/noteHistory'
import HistoryBlockContent from '../../../features/history/HistoryBlockContent.vue'

const props = defineProps<{
  item: ArchiveItemViewModel | null
  loading: boolean
  error: string | null
  blocks: HistoryComparableBlock[]
  moreCount: number
  kind: 'note' | 'folder' | null
  totalCount: number
  restoring?: boolean
}>()

const emit = defineEmits<{
  restore: [id: string]
  delete: [id: string]
}>()

const { t, locale } = useI18n()

function formatDeletedDate(iso: string) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  const calendarDate = new Intl.DateTimeFormat(locale.value, {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  }).format(date)
  const time = new Intl.DateTimeFormat(locale.value, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
  return `${calendarDate}, ${time}`
}

const displayTitle = computed(() => {
  return props.item?.item.title || t('editor.titlePlaceholder')
})

const subtitle = computed(() => {
  if (!props.item) return ''
  const dateStr = formatDeletedDate(props.item.item.deletedAt)
  const deletedPrefix = t('workspace.trash.deletedAt', { date: dateStr })
  if (props.item.daysLeft !== null) {
    return `${deletedPrefix} · ${t('workspace.trash.purgeIn', { days: props.item.daysLeft })}`
  }
  return `${deletedPrefix} · ${t('workspace.trash.retentionForever')}`
})
</script>

<template>
  <div class="trv-main tw:flex tw:min-h-0 tw:min-w-0 tw:flex-col tw:overflow-y-auto tw:border tw:border-solid tw:border-transparent tw:bg-transparent">
    <!-- Empty Archive -->
    <div v-if="totalCount === 0" class="trv-empty tw:m-auto tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-(--r-lg) tw:px-5 tw:py-10 tw:text-center tw:text-[12.5px] tw:text-content-muted">
      <Inbox :size="28" aria-hidden="true" />
      <b class="tw:text-sm tw:font-semibold tw:text-content-primary">{{ t('workspace.trash.emptyTitle') }}</b>
      <span>{{ t('workspace.trash.emptyState') }}</span>
    </div>

    <!-- No item selected -->
    <div v-else-if="!item" class="trv-empty tw:m-auto tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-(--r-lg) tw:px-5 tw:py-10 tw:text-center tw:text-[12.5px] tw:text-content-muted">
      <Inbox :size="28" aria-hidden="true" />
      <span>{{ t('workspace.trash.selectPrompt') }}</span>
    </div>

    <!-- Selected item detail -->
    <template v-else>
      <div class="diff-h tw:flex tw:shrink-0 tw:items-center tw:gap-2.5 tw:px-6 tw:py-3.5">
        <div class="diff-h__title-group tw:flex tw:min-w-0 tw:flex-col tw:gap-0.5" aria-live="polite">
          <h3 class="tw:m-0 tw:truncate tw:text-[15px] tw:font-semibold tw:text-content-primary">{{ displayTitle }}</h3>
          <span class="muted diff-h__sub tw:text-xs tw:text-content-muted">{{ subtitle }}</span>
        </div>
        <span class="sp tw:flex-1" />
        <button
          type="button"
          class="nv-btn nv-btn--ghost nv-btn--sm trv-delete-btn tw:text-danger tw:hover:bg-(--surface-danger)"
          @click="emit('delete', item.item.id)"
        >
          <Trash2 :size="14" aria-hidden="true" />
          <span>{{ t('workspace.trash.deletePermanently') }}</span>
        </button>
        <button
          type="button"
          class="nv-btn nv-btn--primary nv-btn--sm trv-restore-btn"
          :disabled="restoring"
          @click="emit('restore', item.item.id)"
        >
          <RotateCcw :size="14" aria-hidden="true" />
          <span>{{ t('workspace.trash.restore') }}</span>
        </button>
      </div>

      <div class="mstrip tw:mx-4 tw:mb-2 tw:flex tw:shrink-0 tw:gap-[18px] tw:rounded-(--r-sm) tw:border-0 tw:bg-surface-navigation tw:px-4 tw:py-2 tw:text-xs tw:text-content-secondary">
        <span>{{ t('workspace.trash.from', { place: item.parentLabel }) }}</span>
        <span v-if="item.item.type === 'folder'">{{ t('workspace.trash.folderType') }}</span>
      </div>

      <div class="trv-preview tw:flex tw:max-w-[68ch] tw:flex-col tw:gap-3 tw:px-7 tw:pt-3 tw:pb-6 tw:text-sm tw:leading-[1.6] tw:text-content-secondary" :aria-label="t('workspace.trash.previewLabel')">
        <span class="eyebrow">{{ t('workspace.trash.previewLabel') }}</span>

        <!-- Folder preview -->
        <div v-if="kind === 'folder'" class="trv-preview-folder tw:flex tw:items-center tw:gap-2.5 tw:py-5">
          <Folder :size="24" class="muted" aria-hidden="true" />
          <p>{{ t('workspace.trash.folderPreview') }}</p>
        </div>

        <!-- Loading state -->
        <div v-else-if="loading" class="trv-preview-loading tw:flex tw:items-center tw:gap-2.5 tw:py-5">
          <span class="muted">{{ t('common.loading') }}</span>
        </div>

        <!-- Error state -->
        <div v-else-if="error" class="trv-preview-error tw:flex tw:items-center tw:gap-2.5 tw:py-5">
          <p class="muted">{{ t('workspace.trash.previewUnavailable') }}</p>
        </div>

        <!-- Note document blocks -->
        <div v-else class="trv-preview-body">
          <h4 class="tw:mt-1.5 tw:mb-0 tw:text-base tw:font-semibold tw:text-content-primary">{{ displayTitle }}</h4>
          <div v-if="blocks.length > 0" class="trv-preview-blocks tw:flex tw:flex-col tw:gap-2">
            <HistoryBlockContent
              v-for="(block, idx) in blocks"
              :key="`${block.signature}-${idx}`"
              :block="block"
            />
          </div>
          <p v-if="moreCount > 0" class="muted trv-preview-more">
            {{ t('workspace.trash.previewMore', { count: moreCount }) }}
          </p>
        </div>
      </div>
    </template>
  </div>
</template>
