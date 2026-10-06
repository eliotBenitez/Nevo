<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Maximize2, RefreshCw, LayoutGrid } from '@lucide/vue'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import KanbanColumn from './KanbanColumn.vue'
import { getBoardColumns, getCardStatusValue } from './kanbanFields'
import { pluralChoice } from '../../../utils/plural-index'

interface Props {
  board: KanbanBoard
  cards: KanbanCard[]
  syncedAgo?: number
  maxCols?: number
}

const props = withDefaults(defineProps<Props>(), { maxCols: 3, syncedAgo: undefined })
const emit = defineEmits<{
  'open-full': []
  'open-card': [cardId: string]
  'add-card': [columnId: string]
}>()
const { t, locale } = useI18n()

const dragCardId = ref<string | null>(null)

const columns = computed(() => getBoardColumns(props.board).slice(0, props.maxCols))

function cardsForColumn(colId: string): KanbanCard[] {
  return props.cards.filter(card => getCardStatusValue(card, props.board) === colId)
}

const syncLabel = computed(() => {
  const s = props.syncedAgo ?? 0
  if (s < 60) return t('kanban.embedded.syncedSeconds', { n: s })
  return t('kanban.embedded.syncedMinutes', { n: Math.round(s / 60) })
})
</script>

<template>
  <div class="ke-root tw:flex tw:flex-col tw:overflow-hidden tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-panel tw:text-xs">
    <!-- Compact toolbar -->
    <div class="ke-toolbar tw:flex tw:items-center tw:gap-[7px] tw:bg-transparent tw:px-3 tw:py-2">
      <LayoutGrid :size="12" class="ke-toolbar__icon tw:shrink-0 tw:text-content-muted" />
      <span class="ke-toolbar__title tw:text-xs tw:font-semibold tw:text-content-primary">{{ board.title }}</span>
      <span class="ke-toolbar__count tw:font-nv-mono tw:text-[10.5px] tw:text-content-muted">{{ t('kanban.embedded.cardCount', pluralChoice(String(locale), cards.length), { named: { cards: cards.length } }) }}</span>
      <div class="ke-toolbar__spacer tw:flex-1" />
      <button
        type="button"
        class="ke-icon-btn tw:grid tw:size-[22px] tw:place-items-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:text-content-muted tw:cursor-pointer tw:transition-colors tw:duration-100 tw:hover:bg-[var(--hover-strong,var(--surface-overlay))] tw:hover:text-content-secondary"
        :title="t('kanban.embedded.openFullView')"
        :aria-label="t('kanban.embedded.openFullView')"
        @click="emit('open-full')"
      >
        <Maximize2 :size="12" />
      </button>
    </div>

    <!-- Board columns (max 3) -->
    <div class="ke-board tw:flex tw:min-h-[120px] tw:max-h-[360px] tw:items-start tw:gap-2 tw:overflow-x-auto tw:overflow-y-hidden tw:px-3 tw:py-2.5">
      <KanbanColumn
        v-for="col in columns"
        :key="col.id"
        :column="col"
        :cards="cardsForColumn(col.id)"
        :board="board"
        :dragging-card-id="dragCardId"
        :compact="true"
        @open-card="id => emit('open-card', id)"
        @add-card="id => emit('add-card', id)"
      />
      <div v-if="!columns.length" class="ke-empty tw:flex-1 tw:grid tw:place-items-center tw:p-5 tw:text-[11.5px] tw:text-content-muted">
        {{ t('kanban.embedded.noColumns') }}
      </div>
    </div>

    <!-- Footer sync bar -->
    <div class="ke-footer tw:flex tw:items-center tw:gap-[5px] tw:bg-[var(--hover,var(--surface-overlay))] tw:px-3 tw:py-[7px]">
      <RefreshCw :size="10" class="ke-footer__icon tw:shrink-0 tw:text-content-muted" />
      <span class="ke-footer__linked tw:text-[10.5px] tw:text-content-muted">{{ t('kanban.embedded.linkedTo', { title: board.title }) }}</span>
      <span class="ke-footer__dot tw:text-content-muted">·</span>
      <span class="ke-footer__sync tw:text-[10.5px] tw:text-content-muted">{{ syncLabel }}</span>
      <div class="ke-footer__spacer tw:flex-1" />
      <button type="button" class="ke-footer__open tw:border-none tw:bg-transparent tw:p-0 tw:text-[10.5px] tw:text-accent tw:cursor-pointer tw:transition-opacity tw:duration-[120ms] tw:hover:opacity-75" @click="emit('open-full')">
        {{ t('kanban.embedded.openFooter') }}
      </button>
    </div>
  </div>
</template>
