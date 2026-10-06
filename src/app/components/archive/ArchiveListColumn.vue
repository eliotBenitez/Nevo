<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Search, SearchX } from '@lucide/vue'
import type { ArchiveGroup, ArchiveItemViewModel } from '../../composables/useArchiveItems'
import ArchiveListItem from './ArchiveListItem.vue'

const props = defineProps<{
  groups: ArchiveGroup<ArchiveItemViewModel>[]
  items: ArchiveItemViewModel[]
  count: number
  retentionDays: number
  selectedId: string | null
  searchQuery: string
}>()

const emit = defineEmits<{
  'update:searchQuery': [value: string]
  select: [id: string]
  restore: [id: string]
  delete: [id: string]
  empty: []
  back: []
}>()

const { t } = useI18n()

const listboxRef = ref<HTMLElement | null>(null)

const retentionDescription = computed(() => {
  if (props.retentionDays === 0) {
    return t('workspace.trash.retentionForever')
  }
  return t('workspace.trash.retentionDays', { days: props.retentionDays })
})

const activeDescendantId = computed(() => {
  return props.selectedId ? `archive-opt-${props.selectedId}` : undefined
})

function scrollToSelected() {
  if (!props.selectedId || !listboxRef.value) return
  nextTick(() => {
    const el = listboxRef.value?.querySelector<HTMLElement>(`#archive-opt-${props.selectedId}`)
    el?.scrollIntoView?.({ block: 'nearest' })
  })
}

watch(() => props.selectedId, scrollToSelected)

function handleKeydown(event: KeyboardEvent) {
  if (props.items.length === 0) return

  const currentIndex = props.items.findIndex(i => i.item.id === props.selectedId)

  switch (event.key) {
    case 'ArrowDown': {
      event.preventDefault()
      const nextIndex = currentIndex < 0 ? 0 : Math.min(props.items.length - 1, currentIndex + 1)
      const nextItem = props.items[nextIndex]
      if (nextItem) emit('select', nextItem.item.id)
      break
    }
    case 'ArrowUp': {
      event.preventDefault()
      const prevIndex = currentIndex < 0 ? 0 : Math.max(0, currentIndex - 1)
      const prevItem = props.items[prevIndex]
      if (prevItem) emit('select', prevItem.item.id)
      break
    }
    case 'Home': {
      event.preventDefault()
      const firstItem = props.items[0]
      if (firstItem) emit('select', firstItem.item.id)
      break
    }
    case 'End': {
      event.preventDefault()
      const lastItem = props.items[props.items.length - 1]
      if (lastItem) emit('select', lastItem.item.id)
      break
    }
    case 'Enter': {
      event.preventDefault()
      if (props.selectedId) {
        emit('restore', props.selectedId)
      }
      break
    }
    case 'Delete':
    case 'Backspace': {
      event.preventDefault()
      if (props.selectedId) {
        emit('delete', props.selectedId)
      }
      break
    }
  }
}
</script>

<template>
  <div class="trv-side tw:flex tw:min-h-0 tw:flex-col tw:overflow-hidden tw:bg-[color-mix(in_oklab,var(--workspace-navigation-surface)_34%,var(--workspace-editor-surface))] tw:pt-3.5 tw:pr-3 tw:pb-3.5 tw:pl-4">
    <div class="tl-h tw:flex tw:shrink-0 tw:flex-col tw:gap-2">
      <button
        type="button"
        class="nv-btn nv-btn--ghost nv-btn--sm trv-back-btn tw:-ml-2 tw:self-start tw:gap-1.5"
        @click="emit('back')"
      >
        <ArrowLeft :size="16" aria-hidden="true" />
        <span>{{ t('workspace.systemView.backToWorkspace') }}</span>
      </button>

      <h2 id="workspace-archive-heading" class="trv-title tw:m-0 tw:text-sm tw:font-semibold tw:text-content-primary">
        {{ t('workspace.trash.title') }}
      </h2>

      <span class="trv-meta muted tw:text-xs tw:text-content-muted">
        {{ t('workspace.trash.countLabel', { count }) }} · {{ retentionDescription }}
      </span>

      <div class="trv-search tw:flex tw:h-[30px] tw:items-center tw:gap-2 tw:rounded-(--r-sm) tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:transition-[background-color,box-shadow] tw:duration-100 tw:focus-within:bg-(--surface-raised) tw:focus-within:shadow-[0_0_0_2px_var(--input-ring)]">
        <Search :size="14" class="trv-search__icon tw:shrink-0 tw:text-content-muted" aria-hidden="true" />
        <input
          :value="searchQuery"
          type="search"
          class="trv-search__input tw:min-w-0 tw:flex-1 tw:border-0 tw:bg-transparent tw:font-nv-ui tw:text-[12.5px] tw:font-medium tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted"
          :placeholder="t('workspace.trash.searchLabel')"
          :aria-label="t('workspace.trash.searchLabel')"
          :disabled="count === 0"
          @input="emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
        >
      </div>
    </div>

    <div
      ref="listboxRef"
      class="trv-list tw:mt-2.5 tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-0.5 tw:overflow-y-auto tw:outline-none"
      role="listbox"
      :aria-label="t('workspace.trash.title')"
      :aria-activedescendant="activeDescendantId"
      tabindex="0"
      @keydown="handleKeydown"
    >
      <div v-if="count > 0 && items.length === 0" class="trv-no-results tw:flex tw:flex-col tw:items-center tw:justify-center tw:gap-1.5 tw:px-4 tw:py-8 tw:text-center tw:text-content-secondary">
        <SearchX :size="28" class="trv-no-results__icon tw:mb-0.5 tw:text-content-muted" aria-hidden="true" />
        <strong class="tw:text-[13.5px] tw:font-semibold tw:text-content-primary">{{ t('workspace.trash.noResultsTitle') }}</strong>
        <p class="tw:m-0 tw:text-xs tw:text-content-muted">{{ t('workspace.trash.noResultsDescription') }}</p>
      </div>

      <template v-else>
        <div
          v-for="group in groups"
          :key="group.key"
          class="trv-group tw:flex tw:flex-col tw:gap-0.5"
          role="group"
          :aria-label="t(`workspace.trash.groups.${group.key}`)"
        >
          <div class="tl-day tw:px-2 tw:pt-2.5 tw:pb-1 tw:font-nv-mono tw:text-[10.5px] tw:font-medium tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ t(`workspace.trash.groups.${group.key}`) }}</div>
          <ArchiveListItem
            v-for="row in group.items"
            :id="`archive-opt-${row.item.id}`"
            :key="row.item.id"
            :item="row.item"
            :parent-label="row.parentLabel"
            :deleted-label="row.deletedLabel"
            :days-left="row.daysLeft"
            :tone="row.tone"
            :selected="row.item.id === selectedId"
            @select="emit('select', row.item.id)"
          />
        </div>
      </template>
    </div>

    <div class="trv-foot tw:mt-auto tw:flex tw:shrink-0 tw:items-center tw:justify-between tw:gap-2 tw:pt-3">
      <span class="muted trv-foot__hint tw:text-[11.5px] tw:text-content-muted">{{ t('workspace.trash.noUndoHint') }}</span>
      <button
        type="button"
        class="nv-btn nv-btn--ghost nv-btn--sm trv-foot__empty-btn tw:text-danger tw:enabled:hover:bg-(--surface-danger) tw:disabled:cursor-not-allowed tw:disabled:opacity-40"
        :disabled="count === 0"
        @click="emit('empty')"
      >
        {{ t('workspace.trash.emptyAction') }}
      </button>
    </div>
  </div>
</template>
