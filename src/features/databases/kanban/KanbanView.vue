<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowLeft, Kanban, Plus } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import { useKanbanStore } from '../../../stores/kanban'
import { useWorkspaceStore } from '../../../stores/workspace'
import KanbanColumn from './KanbanColumn.vue'
import KanbanCardModal from './KanbanCardModal.vue'
import KanbanToolbar from './KanbanToolbar.vue'
import KanbanTableView from './KanbanTableView.vue'
import KanbanCalendarView from './KanbanCalendarView.vue'
import KanbanGroupView from './KanbanGroupView.vue'
import KanbanAutomations from './KanbanAutomations.vue'
import KanbanAddCardModal from './KanbanAddCardModal.vue'
import type { KanbanBoard, KanbanBoardCardViewSettings } from '../../../types/kanban'
import type { KanbanViewMode, KanbanGroupBy } from './KanbanToolbar.vue'
import { createKanbanId } from './kanbanFields'
import { useKanbanPointerDrag } from './composables/useKanbanPointerDrag'

interface Props { boardId: string }
const props = defineProps<Props>()
const emit = defineEmits<{ 'back': [] }>()
const { t } = useI18n()

const kanbanStore = useKanbanStore()
const workspaceStore = useWorkspaceStore()
const { boards, cards, activeCardId, boardsError, cardsError, moveError } = storeToRefs(kanbanStore)
const { appConfig } = storeToRefs(workspaceStore)

const board = ref<KanbanBoard | null>(null)
const boardScrollRef = ref<HTMLElement | null>(null)
const boardCards = computed(() => cards.value.get(props.boardId) ?? [])
const activeCard = computed(() =>
  activeCardId.value ? boardCards.value.find(c => c.id === activeCardId.value) ?? null : null
)
const columns = computed(() => board.value ? kanbanStore.columnsForBoard(board.value) : [])
const statusPropertyId = computed(() =>
  board.value && typeof board.value.statusPropertyId === 'string' ? board.value.statusPropertyId : ''
)

// View state
const activeView = ref<KanbanViewMode>('board')
const groupBy = ref<KanbanGroupBy>('status')
const filterCount = ref(0)
const searchQuery = ref('')

// Modals
const isLoading = ref(true)
const notFound = ref(false)
const loadError = ref<string | null>(null)
const showAutomations = ref(false)
const showAddCardModal = ref(false)
const addCardDefaultColumnId = ref<string | undefined>(undefined)

let loadRequestId = 0
const COLUMN_COLORS = ['#6b7280', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#14b8a6']

// Pointer drag-and-drop engine (shared state reused by the native HTML5 path).
const {
  dragCardId,
  dragFromColumnId,
  dropTargetColumnId,
  dropTargetIndex,
  pointerFloatingCardStyle,
  pointerFloatingCardId,
  onCardHandlePointerDown,
  clearDragState,
  floatingPlaceholderIndex,
} = useKanbanPointerDrag({
  cardsForColumn,
  getReducedMotion: () => appConfig.value.reducedMotion,
  onCommitMove: (cardId, toColumnId, targetIndex) => {
    void kanbanStore.moveCard(props.boardId, cardId, toColumnId, targetIndex)
  },
})

// Filtered cards for search
const filteredBoardCards = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return boardCards.value
  return boardCards.value.filter(c => c.title.toLowerCase().includes(q))
})
const boardCardSettings = computed<KanbanBoardCardViewSettings>(() => ({
  showCardPreview: true,
  cardDensity: 'comfortable',
  ...(board.value?.viewSettings?.board ?? {}),
}))
const cardPropertyOptions = computed(() =>
  Array.from(boardCards.value.reduce((map, card) => {
    for (const field of card.fields ?? []) {
      if (!map.has(field.id)) map.set(field.id, field.name)
    }
    return map
  }, new Map<string, string>()).entries()).map(([id, name]) => ({ id, name }))
)
const noSearchResults = computed(() =>
  activeView.value === 'board' && searchQuery.value.trim().length > 0 && filteredBoardCards.value.length === 0
)

// Computed: which view to show for 'board' mode
const showGroupView = computed(() => activeView.value === 'board' && groupBy.value !== 'status')

watch(() => props.boardId, boardId => void resolveBoardRoute(boardId), { immediate: true })
watch(() => boards.value.get(props.boardId) ?? null, nextBoard => {
  if (nextBoard) board.value = nextBoard
}, { immediate: true })

function cardsForColumn(columnId: string) {
  if (!board.value || !statusPropertyId.value) return []
  const all = kanbanStore.cardsForColumn(props.boardId, columnId, statusPropertyId.value)
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return all
  return all.filter(c => c.title.toLowerCase().includes(q))
}

function addCard(columnId?: string) {
  if (!board.value) return
  addCardDefaultColumnId.value = columnId ?? columns.value[0]?.id
  showAddCardModal.value = true
}

async function addStatusColumn() {
  if (!board.value) return
  const nextColumn = {
    id: createKanbanId(),
    name: t('kanban.view.newColumn'),
    color: COLUMN_COLORS[columns.value.length % COLUMN_COLORS.length],
  }
  await kanbanStore.updateBoardColumns(props.boardId, [...columns.value, nextColumn])
}

async function renameStatusColumn(columnId: string, name: string) {
  if (!board.value) return
  await kanbanStore.updateBoardColumns(props.boardId, columns.value.map(column =>
    column.id === columnId ? { ...column, name } : column,
  ))
}

async function deleteStatusColumn(columnId: string) {
  if (!board.value || columns.value.length <= 1) return
  const nextColumns = columns.value.filter(column => column.id !== columnId)
  const fallbackColumnId = nextColumns[0]?.id
  if (!fallbackColumnId) return
  await kanbanStore.updateBoardColumns(props.boardId, nextColumns, { [columnId]: fallbackColumnId })
}

async function confirmAddCard(title: string, columnId: string) {
  showAddCardModal.value = false
  await kanbanStore.createCard(props.boardId, title, columnId)
}

async function quickAddCard(columnId: string, title: string) {
  await kanbanStore.createCard(props.boardId, title, columnId)
}

async function updateBoardDisplaySettings(settings: KanbanBoardCardViewSettings) {
  await kanbanStore.updateBoardViewSettings(props.boardId, settings)
}

function onBoardWheel(event: WheelEvent) {
  const boardEl = boardScrollRef.value
  if (!boardEl) return

  const hasHorizontalOverflow = boardEl.scrollWidth > boardEl.clientWidth + 1
  if (!hasHorizontalOverflow) return
  if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.deltaY === 0) return

  const delta = event.deltaY
  const nextScrollLeft = boardEl.scrollLeft + delta
  const maxScrollLeft = boardEl.scrollWidth - boardEl.clientWidth
  const clampedNextScrollLeft = Math.max(0, Math.min(nextScrollLeft, maxScrollLeft))

  if (clampedNextScrollLeft === boardEl.scrollLeft) return

  event.preventDefault()
  boardEl.scrollLeft = clampedNextScrollLeft
}

function onCardDragStart(event: DragEvent, cardId: string, columnId: string) {
  dragCardId.value = cardId
  dragFromColumnId.value = columnId
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', cardId)
    event.dataTransfer.setData('cardId', cardId)
    event.dataTransfer.setData('fromColumn', columnId)
  }
}

function getTransferValue(event: DragEvent, key: string) {
  return event.dataTransfer?.getData(key)?.trim() ?? ''
}

function resolveDraggedCardId(event: DragEvent) {
  return dragCardId.value
    || getTransferValue(event, 'cardId')
    || getTransferValue(event, 'text/plain')
}

async function onDrop(event: DragEvent, toColumnId: string, targetIndex: number) {
  try {
    const cardId = resolveDraggedCardId(event)
    if (!cardId || !board.value) return
    await kanbanStore.moveCard(props.boardId, cardId, toColumnId, targetIndex)
  } finally {
    clearDragState()
  }
}

function onColumnDragEnter(columnId: string) {
  dropTargetColumnId.value = columnId
}

function onBoardDragEnd() {
  clearDragState()
}

// Drop tooltip: name of column the card would move to
const dropStatusName = computed(() => {
  if (!dropTargetColumnId.value || !board.value) return ''
  const opts = kanbanStore.columnsForBoard(board.value)
  return opts.find(o => o.id === dropTargetColumnId.value)?.name ?? ''
})

function openCard(cardId: string) { kanbanStore.openCard(cardId) }

onBeforeUnmount(() => {
  clearDragState()
})

async function resolveBoardRoute(boardId: string) {
  const requestId = ++loadRequestId
  isLoading.value = true
  notFound.value = false
  loadError.value = null
  board.value = null
  clearDragState()
  kanbanStore.closeCard()

  const boardsLoaded = await kanbanStore.loadBoards()
  if (requestId !== loadRequestId) return

  if (!boardsLoaded || boardsError.value) {
    loadError.value = boardsError.value ?? t('kanban.view.loadBoardFallback')
    isLoading.value = false
    return
  }

  if (!boards.value.has(boardId)) {
    notFound.value = true
    isLoading.value = false
    return
  }

  board.value = boards.value.get(boardId) ?? null

  const cardsLoaded = await kanbanStore.loadCards(boardId)
  if (requestId !== loadRequestId) return

  if (!cardsLoaded || cardsError.value) {
    loadError.value = cardsError.value ?? t('kanban.view.loadCardsFallback')
    isLoading.value = false
    return
  }

  isLoading.value = false
}

function retryLoad() { void resolveBoardRoute(props.boardId) }
</script>

<template>
  <!-- Loading -->
  <div v-if="isLoading" class="kb-view kb-view--center">
    <span class="kb-view__state-copy">{{ t('kanban.view.loading') }}</span>
  </div>

  <!-- Error -->
  <div v-else-if="loadError" class="kb-view kb-view--center">
    <p class="kb-view__state-title">{{ t('kanban.view.loadBoardErrorTitle') }}</p>
    <p class="kb-view__state-copy">{{ loadError }}</p>
    <div class="kb-view__state-actions">
      <button type="button" class="nv-btn" @click="emit('back')"><ArrowLeft :size="13" /> {{ t('kanban.common.back') }}</button>
      <button type="button" class="nv-btn nv-btn--primary" @click="retryLoad">{{ t('kanban.common.retry') }}</button>
    </div>
  </div>

  <!-- Not found -->
  <div v-else-if="notFound" class="kb-view kb-view--center">
    <p class="kb-view__state-title">{{ t('kanban.view.boardNotFound') }}</p>
    <button type="button" class="nv-btn nv-btn--primary" @click="emit('back')">
      <ArrowLeft :size="13" /> {{ t('kanban.common.back') }}
    </button>
  </div>

  <!-- Board view -->
  <div v-else-if="board" class="kb-view">
    <!-- Move error banner -->
    <div v-if="moveError" class="kb-view__error-banner">
      {{ t('kanban.view.moveFailed', { message: moveError }) }}
      <button type="button" class="nv-btn" @click="kanbanStore.moveError = null">✕</button>
    </div>

    <!-- Page header -->
    <div class="kb-view__header">
      <button type="button" class="nv-btn kb-view__back" :aria-label="t('kanban.common.back')" @click="emit('back')">
        <ArrowLeft :size="14" />
      </button>
      <NvNoteIcon :value="board.icon" :size="18" class="kb-view__icon" />
      <h1 class="kb-view__title">{{ board.title }}</h1>
      <span class="kb-view__card-count">{{ t('kanban.view.cardCount', { n: boardCards.length }) }}</span>
    </div>

    <!-- Toolbar -->
    <KanbanToolbar
      v-model:view="activeView"
      v-model:group-by="groupBy"
      v-model:search-query="searchQuery"
      :filter-count="filterCount"
      :board-title="board.title"
      :card-count="boardCards.length"
      :board-settings="boardCardSettings"
      :card-property-options="cardPropertyOptions"
      @new-card="columns.length ? addCard(columns[0].id) : undefined"
      @add-column="addStatusColumn"
      @update:board-settings="updateBoardDisplaySettings"
    />

    <!-- Group view (board mode, groupBy !== status) -->
    <KanbanGroupView
      v-if="showGroupView"
      :board="board"
      :cards="filteredBoardCards"
      :group-by="groupBy"
      :dragging-card-id="dragCardId"
      @open-card="openCard"
      @add-card="() => columns.length ? addCard(columns[0].id) : undefined"
    />

    <!-- Board view (groupBy === status) -->
    <div
      v-else-if="activeView === 'board'"
      ref="boardScrollRef"
      class="kb-view__board"
      @wheel="onBoardWheel"
      @dragend="onBoardDragEnd"
    >
      <KanbanColumn
        v-for="col in columns"
        :key="col.id"
        :column="col"
        :cards="cardsForColumn(col.id)"
        :board="board"
        :dragging-card-id="dragCardId"
        :floating-card-id="pointerFloatingCardId"
        :floating-card-style="pointerFloatingCardStyle"
        :floating-placeholder-index="floatingPlaceholderIndex(col.id)"
        :active-drop-zone-index="dropTargetColumnId === col.id ? dropTargetIndex : null"
        :wip="board.wip?.[col.id]"
        :can-delete="columns.length > 1"
        :compact="boardCardSettings.cardDensity === 'compact'"
        :view-settings="boardCardSettings"
        @add-card="addCard"
        @quick-add-card="quickAddCard"
        @open-card="openCard"
        @card-dragstart="(e, cardId, colId) => onCardDragStart(e, cardId, colId)"
        @card-handle-pointerdown="(e, cardId, colId) => onCardHandlePointerDown(e, cardId, colId)"
        @drop="(e, colId, idx) => onDrop(e, colId, idx)"
        @col-dragenter="onColumnDragEnter"
        @rename-column="renameStatusColumn"
        @delete-column="deleteStatusColumn"
      />

      <!-- Drop status change tooltip -->
      <Teleport v-if="dragCardId && dropTargetColumnId && dropTargetColumnId !== dragFromColumnId" to="body">
        <div class="kb-drop-tooltip">
          <span class="kb-drop-tooltip__icon">⚡</span>
          {{ t('kanban.board.dropHere') }}
          <strong>{{ dropStatusName }}</strong>
        </div>
      </Teleport>

      <!-- Add column ghost -->
      <div
        v-if="columns.length > 0"
        class="kb-view__add-col"
        @click="addStatusColumn"
      >
        <Plus :size="11" />
        {{ t('kanban.view.addColumn') }}
      </div>

      <div v-if="noSearchResults" class="kb-view__no-results">
        <div class="kb-view__empty-icon"><Kanban :size="18" /></div>
        <p class="kb-view__empty-title">{{ t('kanban.view.noResultsTitle') }}</p>
        <p class="kb-view__empty-hint">{{ t('kanban.view.noResultsHint') }}</p>
      </div>

      <!-- Empty board -->
      <div v-if="columns.length === 0" class="kb-view__empty">
        <div class="kb-view__empty-icon"><Kanban :size="20" /></div>
        <p class="kb-view__empty-title">{{ t('kanban.view.emptyTitle') }}</p>
        <p class="kb-view__empty-hint">{{ t('kanban.view.emptyHint') }}</p>
        <div class="kb-view__empty-actions">
          <button type="button" class="nv-btn nv-btn--primary" @click="addStatusColumn">
            <Plus :size="12" /> {{ t('kanban.view.addColumn') }}
          </button>
          <button type="button" class="nv-btn" @click="showAutomations = true">{{ t('kanban.view.openTemplates') }}</button>
        </div>
      </div>
    </div>

    <!-- Table view -->
    <KanbanTableView
      v-else-if="activeView === 'table'"
      :board="board"
      :cards="filteredBoardCards"
      :search-query="searchQuery"
      @open-card="openCard"
    />

    <!-- Calendar view -->
    <KanbanCalendarView
      v-else-if="activeView === 'calendar'"
      :board="board"
      :cards="filteredBoardCards"
      :search-query="searchQuery"
      @open-card="openCard"
    />

    <!-- Card modal -->
    <KanbanCardModal
      v-if="activeCard"
      :card="activeCard"
      :board="board"
      @close="kanbanStore.closeCard()"
    />

    <!-- Add card modal -->
    <KanbanAddCardModal
      v-if="showAddCardModal && board"
      :board="board"
      :default-column-id="addCardDefaultColumnId"
      @confirm="confirmAddCard"
      @close="showAddCardModal = false"
    />

    <!-- Automations panel -->
    <KanbanAutomations
      v-if="showAutomations"
      :board="board"
      @close="showAutomations = false"
      @update-automations="() => {}"
    />
  </div>

  <!-- Fallback -->
  <div v-else class="kb-view kb-view--center">
    <p class="kb-view__state-title">{{ t('kanban.view.boardUnavailable') }}</p>
    <div class="kb-view__state-actions">
      <button type="button" class="nv-btn" @click="emit('back')"><ArrowLeft :size="13" /> {{ t('kanban.common.back') }}</button>
      <button type="button" class="nv-btn nv-btn--primary" @click="retryLoad">{{ t('kanban.common.retry') }}</button>
    </div>
  </div>
</template>

<style scoped>
:global(body.kb-kanban-dragging) {
  cursor: grabbing;
  user-select: none;
}

.kb-view {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background:
    linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 62%, transparent), transparent 180px),
    var(--canvas-1, var(--surface-0));
}

.kb-view--center {
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 20px;
  text-align: center;
  color: var(--text-3, var(--text-muted));
  font-size: 13px;
}

.kb-view__state-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1, var(--text-primary));
}

.kb-view__state-copy {
  margin: 0;
  max-width: 420px;
  color: var(--text-2, var(--text-secondary));
  line-height: 1.5;
}

.kb-view__state-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-view__error-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 16px;
  background: oklch(0.55 0.18 25 / 0.12);
  border-bottom: 1px solid oklch(0.55 0.18 25 / 0.3);
  font-size: 12px;
  color: var(--text-2, var(--text-secondary));
  flex-shrink: 0;
}

/* Page header */
.kb-view__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 20px 10px;
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  flex-shrink: 0;
}

.kb-view__back { color: var(--text-3, var(--text-muted)); }

.kb-view__icon { font-size: 18px; line-height: 1; }

.kb-view__title {
  font-size: 20px;
  font-weight: 650;
  color: var(--text-1, var(--text-primary));
  flex: 1;
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-view__card-count {
  font-size: 11px;
  color: var(--text-4, var(--text-muted));
  font-family: var(--font-mono, monospace);
  flex-shrink: 0;
}

/* Board lane */
.kb-view__board {
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px 22px;
  overflow-x: auto;
  overflow-y: hidden;
  position: relative;
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong, var(--border-subtle)) transparent;
}

.kb-view__board::-webkit-scrollbar {
  height: 12px;
}

.kb-view__board::-webkit-scrollbar-track {
  background: transparent;
}

.kb-view__board::-webkit-scrollbar-thumb {
  background: color-mix(in oklab, var(--line-strong, var(--border-subtle)) 92%, transparent);
  border-radius: 999px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

/* Drop status tooltip */
.kb-drop-tooltip {
  position: fixed;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 300;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 999px;
  background: var(--glass-3, var(--surface-1));
  border: 1px solid var(--accent);
  box-shadow: 0 8px 24px oklch(0 0 0 / 0.25), 0 0 12px var(--accent-glow, oklch(0.66 0.10 258 / 0.2));
  font-size: 12.5px;
  color: var(--text-2, var(--text-secondary));
  pointer-events: none;
  animation: kb-tooltip-in 0.15s ease;
}

@keyframes kb-tooltip-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.kb-drop-tooltip__icon { font-size: 11px; }

/* Add column ghost */
.kb-view__add-col {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 210px;
  flex-shrink: 0;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px dashed var(--line-strong, var(--border-muted));
  color: var(--text-4, var(--text-muted));
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  align-self: flex-start;
}

.kb-view__add-col:hover { border-color: var(--accent); color: var(--accent); }

.kb-view__no-results {
  position: sticky;
  left: 50%;
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 260px;
  margin: 40px 20px;
  text-align: center;
  pointer-events: none;
}

/* Empty board */
.kb-view__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin: auto;
  text-align: center;
}

.kb-view__empty-icon {
  width: 44px;
  height: 44px;
  border-radius: 11px;
  background: var(--accent-soft, oklch(0.66 0.10 258 / 0.12));
  color: var(--accent);
  display: grid;
  place-items: center;
}

.kb-view__empty-title {
  font-family: var(--font-serif, Georgia, serif);
  font-style: italic;
  font-weight: 400;
  font-size: 20px;
  color: var(--text-1, var(--text-primary));
  margin: 0;
  letter-spacing: -0.01em;
}

.kb-view__empty-hint {
  font-size: 12.5px;
  color: var(--text-3, var(--text-secondary));
  max-width: 300px;
  line-height: 1.5;
  margin: 0;
}

.kb-view__empty-actions { display: flex; gap: 6px; }

/* Property panel backdrop */
.kb-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 250;
  background: oklch(0 0 0 / 0.3);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
