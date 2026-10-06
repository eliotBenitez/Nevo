<script setup lang="ts">
import { computed } from 'vue'
import { ArrowLeft, Search, SlidersHorizontal } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
import { pluralChoice } from '../../../utils/plural-index'

interface Props {
  searchQuery: string
  nodeCount: number
  edgeCount: number
  mobileFiltersOpen: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  back: []
  'update:searchQuery': [value: string]
  'update:mobileFiltersOpen': [value: boolean]
}>()

const { t, locale } = useI18n()
const searchValue = computed({
  get: () => props.searchQuery,
  set: (value: string) => emit('update:searchQuery', value),
})
const nodeLabel = computed(() => t(
  'graph.nodeCount',
  pluralChoice(String(locale.value), props.nodeCount),
  { named: { total: props.nodeCount } },
))
const edgeLabel = computed(() => t(
  'graph.edgeCount',
  pluralChoice(String(locale.value), props.edgeCount),
  { named: { total: props.edgeCount } },
))
</script>

<template>
  <header class="graph-header tw:z-2 tw:flex tw:h-12 tw:shrink-0 tw:items-center tw:gap-2.5 tw:border-b-0 tw:bg-(--island-bg) tw:px-3 tw:max-[719px]:pointer-events-none tw:max-[719px]:absolute tw:max-[719px]:inset-x-0 tw:max-[719px]:top-0 tw:max-[719px]:z-20 tw:max-[719px]:grid tw:max-[719px]:h-auto tw:max-[719px]:min-h-[calc(58px_+_max(var(--safe-area-top),0px))] tw:max-[719px]:grid-cols-[44px_minmax(0,1fr)_44px] tw:max-[719px]:gap-2 tw:max-[719px]:bg-transparent tw:max-[719px]:pt-[max(var(--safe-area-top),0px)] tw:max-[719px]:pr-[calc(14px_+_max(var(--safe-area-right),0px))] tw:max-[719px]:pb-[7px] tw:max-[719px]:pl-[calc(12px_+_max(var(--safe-area-left),0px))]">
    <button
      type="button"
      class="graph-header__back nv-btn tw:max-[719px]:pointer-events-auto tw:max-[719px]:grid tw:max-[719px]:size-11 tw:max-[719px]:min-w-11 tw:max-[719px]:place-items-center tw:max-[719px]:rounded-[calc(14px*var(--radius-scale,1))] tw:max-[719px]:border tw:max-[719px]:border-solid tw:max-[719px]:border-transparent tw:max-[719px]:bg-(--input-bg) tw:max-[719px]:p-0 tw:max-[719px]:shadow-[0_12px_30px_-22px_var(--shadow)]"
      :aria-label="t('graph.backToEditor')"
      @click="emit('back')"
    >
      <ArrowLeft :size="12" aria-hidden="true" />
      <span class="tw:max-[719px]:hidden">{{ t('graph.backToEditor') }}</span>
    </button>

    <div class="graph-header__search tw:flex tw:h-[30px] tw:max-w-80 tw:flex-1 tw:items-center tw:gap-[7px] tw:rounded-[calc(9px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:transition-[border-color,box-shadow] tw:duration-150 tw:focus-within:border-accent tw:focus-within:shadow-[0_0_0_2px_var(--accent-soft)] tw:max-[719px]:pointer-events-auto tw:max-[719px]:h-11 tw:max-[719px]:w-full tw:max-[719px]:min-w-0 tw:max-[719px]:max-w-none tw:max-[719px]:rounded-[calc(14px*var(--radius-scale,1))] tw:max-[719px]:bg-(--island-bg) tw:max-[719px]:shadow-[0_12px_30px_-22px_var(--shadow)]">
      <Search :size="13" class="graph-header__search-icon tw:shrink-0 tw:text-content-muted" aria-hidden="true" />
      <input
        v-model="searchValue"
        class="graph-header__search-input tw:min-w-0 tw:flex-1 tw:border-none tw:bg-transparent tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted tw:max-[719px]:text-sm"
        :aria-label="t('graph.searchPlaceholder')"
        :placeholder="t('graph.searchPlaceholder')"
      />
    </div>

    <div class="graph-header__meta tw:ml-auto tw:flex tw:items-center tw:gap-1.5 tw:max-[719px]:hidden">
      <span class="graph-meta-pill tw:inline-flex tw:h-[22px] tw:items-center tw:rounded-[calc(20px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2 tw:font-nv-mono tw:text-[11px] tw:text-content-muted">{{ nodeLabel }}</span>
      <span class="graph-header__meta-separator" aria-hidden="true">·</span>
      <span class="graph-meta-pill tw:inline-flex tw:h-[22px] tw:items-center tw:rounded-[calc(20px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2 tw:font-nv-mono tw:text-[11px] tw:text-content-muted">{{ edgeLabel }}</span>
    </div>

    <button
      type="button"
      class="graph-header__filter tw:hidden tw:max-[719px]:pointer-events-auto tw:max-[719px]:grid tw:max-[719px]:size-11 tw:max-[719px]:place-items-center tw:max-[719px]:rounded-[calc(14px*var(--radius-scale,1))] tw:max-[719px]:border tw:max-[719px]:border-solid tw:max-[719px]:border-transparent tw:max-[719px]:bg-surface-subtle tw:max-[719px]:p-0 tw:max-[719px]:text-content-secondary tw:max-[719px]:shadow-[0_12px_30px_-22px_var(--shadow)] tw:max-[719px]:aria-pressed:bg-(--accent-soft) tw:max-[719px]:aria-pressed:text-accent"
      :class="{ 'is-active': mobileFiltersOpen }"
      :aria-label="t('graph.filters')"
      :aria-pressed="mobileFiltersOpen"
      @click="emit('update:mobileFiltersOpen', !mobileFiltersOpen)"
    >
      <SlidersHorizontal :size="18" aria-hidden="true" />
    </button>
  </header>
</template>

<style scoped>
.graph-header__meta-separator {
  display: none;
}

@media (min-width: 720px) and (pointer: coarse) {
  .graph-header {
    gap: 10px;
    box-sizing: border-box;
  }

  .graph-header__back {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: auto;
    min-width: 44px;
    height: 44px;
    padding-inline: 10px;
    color: var(--text-secondary);
    background: transparent;
    white-space: nowrap;
  }

  .graph-header__back:hover:not(:disabled) {
    background: var(--surface-subtle);
  }

  .graph-header__back svg {
    width: 16px;
    height: 16px;
  }

  .graph-header__search {
    flex: 1;
    width: 100%;
    min-width: 0;
    max-width: 448px;
    height: 44px;
    padding-inline: 12px;
  }

  .graph-header__search-input {
    height: 100%;
    font-size: 14px;
  }

  .graph-header__meta {
    gap: 5px;
    white-space: nowrap;
  }

  .graph-meta-pill {
    height: auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .graph-header__meta-separator {
    display: inline;
    color: var(--text-muted);
  }
}
</style>
