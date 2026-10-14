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
  <header class="graph-header tw:z-2 tw:flex tw:h-12 tw:shrink-0 tw:items-center tw:gap-2.5 tw:border-b-0 tw:bg-(--island-bg) tw:px-3 tw:max-[719px]:pointer-events-none tw:max-[719px]:absolute tw:max-[719px]:inset-x-0 tw:max-[719px]:top-0 tw:max-[719px]:z-20 tw:max-[719px]:grid tw:max-[719px]:h-auto tw:max-[719px]:min-h-[calc(58px_+_max(var(--safe-area-top),0px))] tw:max-[719px]:grid-cols-[44px_minmax(0,1fr)_44px] tw:max-[719px]:gap-2 tw:max-[719px]:bg-transparent tw:max-[719px]:pt-[max(var(--safe-area-top),0px)] tw:max-[719px]:pr-[calc(14px_+_max(var(--safe-area-right),0px))] tw:max-[719px]:pb-[7px] tw:max-[719px]:pl-[calc(12px_+_max(var(--safe-area-left),0px))] tw:min-[720px]:coarse:box-border">
    <button
      type="button"
      class="graph-header__back nv-btn tw:min-[720px]:coarse:flex tw:min-[720px]:coarse:items-center tw:min-[720px]:coarse:justify-center tw:min-[720px]:coarse:gap-1.5 tw:min-[720px]:coarse:w-auto tw:min-[720px]:coarse:min-w-11 tw:min-[720px]:coarse:h-11 tw:min-[720px]:coarse:px-2.5 tw:min-[720px]:coarse:text-content-secondary tw:min-[720px]:coarse:bg-transparent tw:min-[720px]:coarse:whitespace-nowrap tw:min-[720px]:coarse:hover:bg-surface-subtle tw:min-[720px]:coarse:[&_svg]:size-4 tw:max-[719px]:pointer-events-auto tw:max-[719px]:grid tw:max-[719px]:size-11 tw:max-[719px]:min-w-11 tw:max-[719px]:place-items-center tw:max-[719px]:rounded-[calc(14px*var(--radius-scale,1))] tw:max-[719px]:border tw:max-[719px]:border-solid tw:max-[719px]:border-transparent tw:max-[719px]:bg-(--input-bg) tw:max-[719px]:p-0 tw:max-[719px]:shadow-[0_12px_30px_-22px_var(--shadow)]"
      :aria-label="t('graph.backToEditor')"
      @click="emit('back')"
    >
      <ArrowLeft :size="12" aria-hidden="true" />
      <span class="tw:max-[719px]:hidden">{{ t('graph.backToEditor') }}</span>
    </button>

    <div class="graph-header__search tw:flex tw:h-[30px] tw:max-w-80 tw:flex-1 tw:items-center tw:gap-[7px] tw:rounded-[calc(9px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:transition-[border-color,box-shadow] tw:duration-150 tw:focus-within:border-accent tw:focus-within:shadow-[0_0_0_2px_var(--accent-soft)] tw:max-[719px]:pointer-events-auto tw:max-[719px]:h-11 tw:max-[719px]:w-full tw:max-[719px]:min-w-0 tw:max-[719px]:max-w-none tw:max-[719px]:rounded-[calc(14px*var(--radius-scale,1))] tw:max-[719px]:bg-(--island-bg) tw:max-[719px]:shadow-[0_12px_30px_-22px_var(--shadow)] tw:min-[720px]:coarse:w-full tw:min-[720px]:coarse:min-w-0 tw:min-[720px]:coarse:max-w-[448px] tw:min-[720px]:coarse:h-11 tw:min-[720px]:coarse:px-3">
      <Search :size="13" class="graph-header__search-icon tw:shrink-0 tw:text-content-muted" aria-hidden="true" />
      <input
        v-model="searchValue"
        class="graph-header__search-input tw:min-w-0 tw:flex-1 tw:border-none tw:bg-transparent tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted tw:max-[719px]:text-sm tw:min-[720px]:coarse:h-full tw:min-[720px]:coarse:text-[14px]"
        :aria-label="t('graph.searchPlaceholder')"
        :placeholder="t('graph.searchPlaceholder')"
      />
    </div>

    <div class="graph-header__meta tw:ml-auto tw:flex tw:items-center tw:gap-1.5 tw:max-[719px]:hidden tw:min-[720px]:coarse:gap-[5px] tw:min-[720px]:coarse:whitespace-nowrap">
      <span class="graph-meta-pill tw:inline-flex tw:h-[22px] tw:items-center tw:rounded-[calc(20px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2 tw:font-nv-mono tw:text-[11px] tw:text-content-muted tw:min-[720px]:coarse:h-auto tw:min-[720px]:coarse:p-0 tw:min-[720px]:coarse:border-0 tw:min-[720px]:coarse:rounded-none tw:min-[720px]:coarse:bg-transparent">{{ nodeLabel }}</span>
      <span class="graph-header__meta-separator tw:hidden tw:min-[720px]:coarse:inline tw:min-[720px]:coarse:text-content-muted" aria-hidden="true">·</span>
      <span class="graph-meta-pill tw:inline-flex tw:h-[22px] tw:items-center tw:rounded-[calc(20px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:px-2 tw:font-nv-mono tw:text-[11px] tw:text-content-muted tw:min-[720px]:coarse:h-auto tw:min-[720px]:coarse:p-0 tw:min-[720px]:coarse:border-0 tw:min-[720px]:coarse:rounded-none tw:min-[720px]:coarse:bg-transparent">{{ edgeLabel }}</span>
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
