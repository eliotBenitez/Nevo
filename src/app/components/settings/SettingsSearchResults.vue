<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { ArrowRight, SearchX } from 'lucide-vue-next'
import type { WorkspaceSettingSearchItem } from '../../../types/search'

interface Props {
  search: string
  results: WorkspaceSettingSearchItem[]
}

defineProps<Props>()
const emit = defineEmits<{
  'select-result': [result: WorkspaceSettingSearchItem]
}>()

const { t } = useI18n()
</script>

<template>
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col">
    <header class="panel-header tw:relative tw:flex tw:items-end tw:justify-between tw:gap-4 tw:border-b-0 tw:bg-transparent tw:px-[30px] tw:pt-5 tw:pb-4 tw:max-[980px]:flex-col tw:max-[980px]:items-stretch tw:max-[719px]:px-4 tw:max-[719px]:pt-4 tw:max-[719px]:pb-[14px]">
      <div>
        <h2 class="panel-title tw:m-0 tw:[font-family:var(--font-serif)] tw:text-[26px] tw:leading-[1.06] tw:font-normal tw:tracking-[0] tw:text-content-primary tw:max-[719px]:text-[23px]">{{ t('settings.search.resultsTitle', { query: search }) }}</h2>
        <p class="panel-sub tw:mt-[6px] tw:mb-0 tw:text-[13px] tw:leading-normal tw:text-content-muted">{{ t('settings.search.resultsCount', { count: results.length }) }}</p>
      </div>
    </header>
    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <div class="results-card tw:grid tw:gap-[10px] tw:overflow-visible tw:rounded-none tw:border-0 tw:bg-transparent">
        <button
          v-for="result in results"
          :key="result.id"
          type="button"
          class="result-row tw:group tw:grid tw:min-h-[74px] tw:w-full tw:cursor-pointer tw:grid-cols-[minmax(0,1fr)_auto] tw:items-center tw:gap-4 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:p-[14px] tw:text-left tw:text-inherit tw:transition-[background,box-shadow] tw:duration-120 tw:hover:bg-[var(--hover)] tw:focus-visible:shadow-[0_0_0_2px_var(--accent)] tw:focus-visible:outline-none"
          :aria-label="t('settings.search.openResult', { title: result.title, section: result.sectionLabel })"
          @click="emit('select-result', result)"
        >
          <div class="result-row__meta tw:flex tw:min-w-0 tw:items-center tw:gap-[14px]">
            <span class="result-pill tw:inline-flex tw:min-h-[22px] tw:max-w-[140px] tw:flex-[0_1_auto] tw:items-center tw:overflow-hidden tw:rounded-full tw:border tw:border-transparent tw:bg-surface-subtle tw:px-[9px] tw:text-[10.5px] tw:text-content-muted tw:text-ellipsis tw:whitespace-nowrap">{{ result.sectionLabel }}</span>
            <div>
              <div class="result-row__title tw:text-[13.5px] tw:font-[560] tw:text-content-primary tw:[overflow-wrap:anywhere]">{{ result.title }}</div>
              <div class="result-row__desc tw:mt-[3px] tw:text-[11.5px] tw:leading-[1.4] tw:text-content-muted tw:[overflow-wrap:anywhere]">{{ result.description }}</div>
            </div>
          </div>
          <div class="result-row__side tw:inline-flex tw:min-w-0 tw:items-center tw:justify-end tw:gap-[10px]">
            <div class="result-row__value tw:max-w-[220px] tw:font-nv-mono tw:text-xs tw:text-content-secondary tw:text-right tw:[overflow-wrap:anywhere]">{{ result.value }}</div>
            <ArrowRight :size="14" class="result-row__arrow tw:flex-none tw:text-content-muted tw:transition-[color,transform] tw:duration-120 tw:group-hover:translate-x-0.5 tw:group-hover:text-accent" aria-hidden="true" />
          </div>
        </button>
        <div v-if="results.length === 0" class="empty-state tw:grid tw:justify-items-center tw:gap-1.5 tw:px-[18px] tw:py-7 tw:text-center tw:text-content-muted tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-dashed tw:border-[var(--border-default)] tw:bg-transparent">
          <SearchX :size="24" class="empty-state__icon tw:text-content-muted" aria-hidden="true" />
          <div class="empty-state__title tw:text-content-primary tw:text-sm tw:font-[560]">{{ t('settings.search.emptyTitle') }}</div>
          <div class="empty-state__sub tw:mt-1 tw:text-content-muted tw:text-xs">{{ t('settings.search.emptyDescription') }}</div>
        </div>
      </div>
    </div>
  </section>
</template>
