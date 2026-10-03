<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Inbox, Search, SearchX } from 'lucide-vue-next'
import { useDeviceLayout } from '../../../composables/useDeviceLayout'
import { useMobileBackButton } from '../../../composables/useMobileBackButton'
import { useConfirmDialog } from '../../../ui/composables/useConfirmDialog'
import { useArchiveItems } from '../../composables/useArchiveItems'
import { useArchivePreview } from '../../composables/useArchivePreview'
import ArchiveItemDetail from './ArchiveItemDetail.vue'
import ArchiveListColumn from './ArchiveListColumn.vue'
import ArchiveItemRow from './ArchiveItemRow.vue'

const emit = defineEmits<{
  back: []
}>()

const { t } = useI18n()
const { isPhone } = useDeviceLayout()
const { confirmDialogState } = useConfirmDialog()

const {
  searchQuery,
  retentionDays,
  count,
  items,
  groups,
  selectedId,
  selectedItem,
  select,
  restore,
  deleteForever,
  emptyArchive,
} = useArchiveItems()

const {
  loading: previewLoading,
  error: previewError,
  blocks: previewBlocks,
  moreCount: previewMoreCount,
  kind: previewKind,
} = useArchivePreview(selectedItem)

const restoring = ref(false)

async function handleRestore(id: string) {
  restoring.value = true
  try {
    await restore(id)
  } finally {
    restoring.value = false
  }
}

async function handleDelete(id: string) {
  await deleteForever(id)
}

function handleMobileBack() {
  if (searchQuery.value) {
    searchQuery.value = ''
    return
  }
  emit('back')
}

useMobileBackButton(
  handleMobileBack,
  isPhone,
)

function onWindowKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return

  // 1. If confirm dialog is open, do not handle Escape here (NvConfirmDialog handles it)
  if (confirmDialogState.open) return

  // 2. If a select dropdown is open, ignore
  if (document.body.classList.contains('nv-select-open')) return

  // 3. Clear non-empty search query first
  if (searchQuery.value) {
    event.preventDefault()
    event.stopPropagation()
    searchQuery.value = ''
    return
  }

  // 4. Otherwise emit back
  event.preventDefault()
  event.stopPropagation()
  emit('back')
}

onMounted(() => {
  window.addEventListener('keydown', onWindowKeydown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onWindowKeydown, true)
})
</script>

<template>
  <section
    class="archive-view tw:flex tw:h-full tw:min-h-0 tw:w-full tw:flex-col tw:overflow-hidden tw:bg-[var(--workspace-editor-surface,var(--surface-canvas))] tw:text-content-primary"
    aria-labelledby="workspace-archive-heading"
  >
    <!-- Phone layout: single column with inline actions -->
    <div v-if="isPhone" class="archive-phone tw:flex tw:h-full tw:min-h-0 tw:w-full tw:flex-col">
      <header class="archive-phone__topbar tw:flex tw:h-12 tw:shrink-0 tw:items-center tw:px-3">
        <button
          type="button"
          class="archive-phone__back tw:grid tw:size-11 tw:cursor-pointer tw:place-items-center tw:rounded-(--r-sm) tw:border-0 tw:bg-transparent tw:text-content-primary"
          :aria-label="t('workspace.systemView.backToWorkspace')"
          @click="handleMobileBack"
        >
          <ArrowLeft :size="20" aria-hidden="true" />
        </button>
        <h1 id="workspace-archive-heading" class="tw:m-0 tw:flex-1 tw:text-center tw:text-base tw:font-semibold tw:text-content-primary">
          {{ t('workspace.trash.title') }}
        </h1>
        <span class="archive-phone__spacer tw:size-11 tw:shrink-0" aria-hidden="true" />
      </header>

      <div class="archive-search-wrap tw:shrink-0 tw:px-4 tw:pb-2.5">
        <div class="archive-search-field tw:flex tw:h-9 tw:items-center tw:gap-2 tw:rounded-(--r-sm) tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:focus-within:bg-(--surface-raised) tw:focus-within:shadow-[0_0_0_2px_var(--input-ring)]">
          <Search :size="14" class="archive-search-icon tw:shrink-0 tw:text-content-muted" aria-hidden="true" />
          <input
            v-model="searchQuery"
            type="search"
            class="archive-search-input tw:min-w-0 tw:flex-1 tw:border-0 tw:bg-transparent tw:font-nv-ui tw:text-[13px] tw:font-medium tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted"
            :placeholder="t('workspace.trash.searchLabel')"
            :aria-label="t('workspace.trash.searchLabel')"
          >
        </div>
      </div>

      <div class="archive-phone__body tw:min-h-0 tw:flex-1 tw:overflow-y-auto tw:px-3">
        <div v-if="count === 0" class="archive-state archive-empty tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:px-5 tw:py-12 tw:text-center tw:text-content-secondary">
          <Inbox :size="32" class="archive-state__icon tw:mb-1 tw:text-content-muted" aria-hidden="true" />
          <strong class="tw:text-sm tw:font-semibold tw:text-content-primary">{{ t('workspace.trash.emptyTitle') }}</strong>
          <p class="tw:m-0 tw:text-[12.5px] tw:text-content-muted">{{ t('workspace.trash.emptyState') }}</p>
        </div>

        <div v-else-if="items.length === 0" class="archive-state archive-no-results tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:px-5 tw:py-12 tw:text-center tw:text-content-secondary">
          <SearchX :size="32" class="archive-state__icon tw:mb-1 tw:text-content-muted" aria-hidden="true" />
          <strong class="tw:text-sm tw:font-semibold tw:text-content-primary">{{ t('workspace.trash.noResultsTitle') }}</strong>
          <p class="tw:m-0 tw:text-[12.5px] tw:text-content-muted">{{ t('workspace.trash.noResultsDescription') }}</p>
        </div>

        <ul v-else class="archive-list tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-0.5 tw:p-0" role="list">
          <ArchiveItemRow
            v-for="row in items"
            :key="row.item.id"
            :item="row.item"
            :parent-label="row.parentLabel"
            :deleted-label="row.deletedLabel"
            :days-left="row.daysLeft"
            :tone="row.tone"
            :focused="row.item.id === selectedId"
            @focus="select(row.item.id)"
            @restore="handleRestore(row.item.id)"
            @delete="handleDelete(row.item.id)"
          />
        </ul>
      </div>

      <footer class="archive-phone__footer tw:flex tw:shrink-0 tw:items-center tw:justify-between tw:px-4 tw:py-3">
        <span class="muted trv-foot__hint tw:text-[11.5px] tw:text-content-muted">{{ t('workspace.trash.noUndoHint') }}</span>
        <button
          type="button"
          class="nv-btn nv-btn--ghost nv-btn--sm trv-foot__empty-btn tw:text-danger tw:enabled:hover:bg-(--surface-danger) tw:disabled:cursor-not-allowed tw:disabled:opacity-40"
          :disabled="count === 0"
          @click="emptyArchive"
        >
          {{ t('workspace.trash.emptyAction') }}
        </button>
      </footer>
    </div>

    <!-- Desktop layout: 2-column frame + island -->
    <div v-else class="trv tw:grid tw:h-full tw:min-h-0 tw:grid-cols-[320px_minmax(0,1fr)] tw:bg-transparent">
      <ArchiveListColumn
        :groups="groups"
        :items="items"
        :count="count"
        :retention-days="retentionDays"
        :selected-id="selectedId"
        :search-query="searchQuery"
        @update:search-query="searchQuery = $event"
        @select="select"
        @restore="handleRestore"
        @delete="handleDelete"
        @empty="emptyArchive"
        @back="emit('back')"
      />

      <ArchiveItemDetail
        :item="selectedItem"
        :loading="previewLoading"
        :error="previewError"
        :blocks="previewBlocks"
        :more-count="previewMoreCount"
        :kind="previewKind"
        :total-count="count"
        :restoring="restoring"
        @restore="handleRestore"
        @delete="handleDelete"
      />
    </div>
  </section>
</template>
