<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Maximize2, RefreshCw, LayoutGrid } from 'lucide-vue-next'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import KanbanColumn from './KanbanColumn.vue'
import { getBoardColumns, getCardStatusValue } from './kanbanFields'

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
const { t } = useI18n()

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
  <div class="ke-root">
    <!-- Compact toolbar -->
    <div class="ke-toolbar">
      <LayoutGrid :size="12" class="ke-toolbar__icon" />
      <span class="ke-toolbar__title">{{ board.title }}</span>
      <span class="ke-toolbar__count">{{ t('kanban.embedded.cardCount', { n: cards.length }) }}</span>
      <div class="ke-toolbar__spacer" />
      <button
        type="button"
        class="ke-icon-btn"
        :title="t('kanban.embedded.openFullView')"
        :aria-label="t('kanban.embedded.openFullView')"
        @click="emit('open-full')"
      >
        <Maximize2 :size="12" />
      </button>
    </div>

    <!-- Board columns (max 3) -->
    <div class="ke-board">
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
      <div v-if="!columns.length" class="ke-empty">
        {{ t('kanban.embedded.noColumns') }}
      </div>
    </div>

    <!-- Footer sync bar -->
    <div class="ke-footer">
      <RefreshCw :size="10" class="ke-footer__icon" />
      <span class="ke-footer__linked">{{ t('kanban.embedded.linkedTo', { title: board.title }) }}</span>
      <span class="ke-footer__dot">·</span>
      <span class="ke-footer__sync">{{ syncLabel }}</span>
      <div class="ke-footer__spacer" />
      <button type="button" class="ke-footer__open" @click="emit('open-full')">
        {{ t('kanban.embedded.openFooter') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ke-root {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line-2, var(--border-subtle));
  border-radius: 12px;
  background: var(--glass-2, var(--surface-1));
  overflow: hidden;
  font-size: 12px;
}

/* Toolbar */
.ke-toolbar {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  background: var(--glass-titlebar, var(--surface-2));
}

.ke-toolbar__icon { color: var(--text-4, var(--text-muted)); flex-shrink: 0; }

.ke-toolbar__title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1, var(--text-primary));
}

.ke-toolbar__count {
  font-size: 10.5px;
  color: var(--text-4, var(--text-muted));
  font-family: var(--font-mono, monospace);
}

.ke-toolbar__spacer { flex: 1; }

.ke-icon-btn {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: none;
  background: none;
  color: var(--text-4, var(--text-muted));
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.ke-icon-btn:hover {
  background: var(--hover-strong, var(--surface-2));
  color: var(--text-2, var(--text-secondary));
}

/* Board */
.ke-board {
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  overflow-x: auto;
  align-items: flex-start;
  min-height: 120px;
  max-height: 360px;
  overflow-y: hidden;
}

.ke-empty {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--text-4, var(--text-muted));
  font-size: 11.5px;
  padding: 20px;
}

/* Footer */
.ke-footer {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border-top: 1px solid var(--line-1, var(--border-subtle));
  background: var(--hover, var(--surface-2));
}

.ke-footer__icon { color: var(--text-4, var(--text-muted)); flex-shrink: 0; }

.ke-footer__linked,
.ke-footer__sync {
  font-size: 10.5px;
  color: var(--text-4, var(--text-muted));
}

.ke-footer__dot { color: var(--text-4, var(--text-muted)); }

.ke-footer__spacer { flex: 1; }

.ke-footer__open {
  font-size: 10.5px;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  transition: opacity 0.12s;
}

.ke-footer__open:hover { opacity: 0.75; }
</style>
