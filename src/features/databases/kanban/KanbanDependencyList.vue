<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { KanbanCard } from '../../../types/kanban'
import { dependencyPairs } from './kanbanAutomations'

const props = defineProps<{ cards: KanbanCard[] }>()
const { t } = useI18n()

const pairs = computed(() => dependencyPairs(props.cards))
</script>

<template>
  <div class="ka-section tw:flex tw:flex-col tw:gap-2 tw:overflow-hidden tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle">
    <div class="ka-section__head tw:flex tw:items-center tw:gap-2 tw:bg-[var(--hover,var(--surface-overlay))] tw:px-3.5 tw:py-[11px]">
      <span class="ka-section__title tw:text-[10.5px] tw:font-semibold tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ t('kanban.automations.depGraph') }}</span>
      <span v-if="pairs.length" class="ka-section__count tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">{{ pairs.length }}</span>
    </div>
    <ul v-if="pairs.length" class="ka-deps tw:m-0 tw:flex tw:list-none tw:flex-col tw:gap-1.5 tw:px-3.5 tw:pt-0.5 tw:pb-3">
      <li v-for="pair in pairs" :key="`${pair.from.id}>${pair.to.id}`" class="ka-dep tw:text-[13px] tw:leading-[1.4] tw:text-content-secondary">
        <i18n-t keypath="kanban.automations.blocks" scope="global">
          <template #from><strong class="tw:text-content-primary">{{ pair.from.title }}</strong></template>
          <template #to><strong class="tw:text-content-primary">{{ pair.to.title }}</strong></template>
        </i18n-t>
      </li>
    </ul>
    <div v-else class="ka-dep-area tw:flex tw:min-h-20 tw:items-center tw:justify-center">
      <div class="ka-empty ka-empty--compact tw:flex tw:flex-col tw:gap-1 tw:p-4 tw:text-center">
        <div class="ka-empty-title tw:text-[13px] tw:font-[550] tw:text-content-secondary">{{ t('kanban.automations.noDeps') }}</div>
        <div class="ka-empty-hint tw:mx-auto tw:max-w-[320px] tw:text-[11.5px] tw:leading-[1.5] tw:text-content-muted">{{ t('kanban.automations.noDepsHint') }}</div>
      </div>
    </div>
  </div>
</template>
