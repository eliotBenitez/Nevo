<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { onBeforeRouteLeave, onBeforeRouteUpdate } from 'vue-router'
import { ArrowLeft, Kanban, Plus, Zap, X } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import { useKanbanStore } from '../../../stores/kanban'
import { useWorkspaceStore } from '../../../stores/workspace'
import KanbanColumn from './KanbanColumn.vue'
import KanbanCardEditorPane from './KanbanCardEditorPane.vue'
import KanbanToolbar from './KanbanToolbar.vue'
import KanbanTableView from './KanbanTableView.vue'
import KanbanCalendarView from './KanbanCalendarView.vue'
import KanbanGroupView from './KanbanGroupView.vue'
import KanbanAutomations from './KanbanAutomations.vue'
import KanbanAddCardModal from './KanbanAddCardModal.vue'
import { useFirstUseHint } from '../../onboarding/hints/useFirstUseHint'
import type { KanbanBoard, KanbanBoardCardViewSettings, KanbanCard } from '../../../types/kanban'
import type { KanbanViewMode, KanbanGroupBy } from './KanbanToolbar.vue'
import { createKanbanId, localizeDefaultKanbanLabel } from './kanbanFields'
import {
  applyFilters,
  applySort,
  buildFilterSortContext,
  getFilterableFields,
  type KanbanFilterRule,
  type KanbanSortRule,
} from './kanbanFilterSort'
import { useKanbanPointerDrag } from './composables/useKanbanPointerDrag'
import { pluralChoice } from '../../../utils/plural-index'

interface Props { boardId: string }
const props = defineProps<Props>()
const emit = defineEmits<{ 'back': [] }>()
const { t, locale } = useI18n()

useFirstUseHint('kanbanViews')

const kanbanStore = useKanbanStore()
const workspaceStore = useWorkspaceStore()
const { boards, cards, activeCardId, boardsError, cardsError, moveError } = storeToRefs(kanbanStore)
const { appConfig } = storeToRefs(workspaceStore)

const board = ref<KanbanBoard | null>(null)
const boardScrollRef = ref<HTMLElement | null>(null)
const cardEditorRef = ref<InstanceType<typeof KanbanCardEditorPane> | null>(null)
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
const filterRules = ref<KanbanFilterRule[]>([])
const sortRules = ref<KanbanSortRule[]>([])
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

// Filter / sort fields and context
const filterFields = computed(() => {
  if (!board.value) return []
  return getFilterableFields(board.value, boardCards.value, {
    title: t('kanban.table.title'),
    status: t('kanban.groups.status'),
    priority: t('kanban.card.priority'),
    progress: t('kanban.card.progress'),
    created: t('kanban.card.createdAt'),
    updated: t('kanban.card.updatedAt'),
    priorityLevels: {
      none: t('kanban.card.priorityLevels.none'),
      low: t('kanban.card.priorityLevels.low'),
      medium: t('kanban.card.priorityLevels.medium'),
      high: t('kanban.card.priorityLevels.high'),
      urgent: t('kanban.card.priorityLevels.urgent'),
    },
    localizeLabel: label => localizeDefaultKanbanLabel(label, key => t(key)),
  })
})
const filterSortContext = computed(() =>
  board.value ? buildFilterSortContext(board.value, filterFields.value) : null
)

function processCards(cards: KanbanCard[]): KanbanCard[] {
  const ctx = filterSortContext.value
  let result = cards
  const q = searchQuery.value.toLowerCase().trim()
  if (q) result = result.filter(c => c.title.toLowerCase().includes(q))
  if (ctx) {
    if (filterRules.value.length) result = applyFilters(result, filterRules.value, ctx)
    if (sortRules.value.length) result = applySort(result, sortRules.value, ctx)
  }
  return result
}

// Filtered + sorted cards for non-column views
const filteredBoardCards = computed(() => processCards(boardCards.value))
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
const hasActiveQuery = computed(() => searchQuery.value.trim().length > 0 || filterRules.value.length > 0)
const noSearchResults = computed(() =>
  activeView.value === 'board' && hasActiveQuery.value && filteredBoardCards.value.length === 0 && boardCards.value.length > 0
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
  return processCards(all)
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
  const name = opts.find(o => o.id === dropTargetColumnId.value)?.name
  return name ? localizeDefaultKanbanLabel(name, key => t(key)) : ''
})

async function openCard(cardId: string) {
  if (activeCardId.value && cardEditorRef.value && !await cardEditorRef.value.flush()) return
  if (activeCardId.value === cardId) {
    kanbanStore.closeCard()
    return
  }
  kanbanStore.openCard(cardId)
}

async function closeCardEditor() {
  if (cardEditorRef.value && !await cardEditorRef.value.flush()) return
  kanbanStore.closeCard()
}

async function flushBeforeNavigation() {
  if (!activeCardId.value || !cardEditorRef.value) return true
  return await cardEditorRef.value.flush()
}

onBeforeRouteLeave(flushBeforeNavigation)
onBeforeRouteUpdate((to, from) => {
  if (to.params.boardId === from.params.boardId) return true
  return flushBeforeNavigation()
})

onBeforeUnmount(() => {
  clearDragState()
})

async function resolveBoardRoute(boardId: string) {
  const requestId = ++loadRequestId
  isLoading.value = true
  notFound.value = false
  loadError.value = null
  board.value = null
  filterRules.value = []
  sortRules.value = []
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
  <div v-if="isLoading" class="kb-view kb-view--center tw:box-border tw:flex tw:h-full tw:w-full tw:max-w-full tw:min-w-0 tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:overflow-hidden tw:bg-(--island-bg) tw:px-5 tw:py-8 tw:text-center tw:text-[13px] tw:text-content-muted tw:max-[760px]:pt-[calc(32px+max(var(--safe-area-top),0px))] tw:max-[760px]:pr-[calc(20px+max(var(--safe-area-right),0px))] tw:max-[760px]:pb-[calc(32px+max(var(--safe-area-bottom),0px))] tw:max-[760px]:pl-[calc(20px+max(var(--safe-area-left),0px))]">
    <div class="kb-view__loading-card tw:flex tw:w-[min(340px,100%)] tw:flex-col tw:items-center tw:gap-3 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-raised tw:p-[18px] tw:shadow-(--shadow-raised)" role="status" aria-live="polite">
      <span class="kb-view__spinner tw:size-[18px] tw:rounded-full tw:border-2 tw:border-solid tw:border-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:border-t-accent tw:[animation:kb-view-spin_850ms_linear_infinite]" aria-hidden="true" />
      <span class="kb-view__state-copy tw:m-0 tw:max-w-[420px] tw:leading-[1.5] tw:text-content-secondary">{{ t('kanban.view.loading') }}</span>
      <div class="kb-view__loading-rail tw:grid tw:w-full tw:gap-[7px]" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  </div>

  <!-- Error -->
  <div v-else-if="loadError" class="kb-view kb-view--center tw:box-border tw:flex tw:h-full tw:w-full tw:max-w-full tw:min-w-0 tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:overflow-hidden tw:bg-(--island-bg) tw:px-5 tw:py-8 tw:text-center tw:text-[13px] tw:text-content-muted tw:max-[760px]:pt-[calc(32px+max(var(--safe-area-top),0px))] tw:max-[760px]:pr-[calc(20px+max(var(--safe-area-right),0px))] tw:max-[760px]:pb-[calc(32px+max(var(--safe-area-bottom),0px))] tw:max-[760px]:pl-[calc(20px+max(var(--safe-area-left),0px))]">
    <p class="kb-view__state-title tw:m-0 tw:text-[15px] tw:font-semibold tw:text-content-primary">{{ t('kanban.view.loadBoardErrorTitle') }}</p>
    <p class="kb-view__state-copy tw:m-0 tw:max-w-[420px] tw:leading-[1.5] tw:text-content-secondary">{{ loadError }}</p>
    <div class="kb-view__state-actions tw:flex tw:items-center tw:gap-2">
      <button type="button" class="nv-btn" @click="emit('back')"><ArrowLeft :size="13" /> {{ t('kanban.common.back') }}</button>
      <button type="button" class="nv-btn nv-btn--primary" @click="retryLoad">{{ t('kanban.common.retry') }}</button>
    </div>
  </div>

  <!-- Not found -->
  <div v-else-if="notFound" class="kb-view kb-view--center tw:box-border tw:flex tw:h-full tw:w-full tw:max-w-full tw:min-w-0 tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:overflow-hidden tw:bg-(--island-bg) tw:px-5 tw:py-8 tw:text-center tw:text-[13px] tw:text-content-muted tw:max-[760px]:pt-[calc(32px+max(var(--safe-area-top),0px))] tw:max-[760px]:pr-[calc(20px+max(var(--safe-area-right),0px))] tw:max-[760px]:pb-[calc(32px+max(var(--safe-area-bottom),0px))] tw:max-[760px]:pl-[calc(20px+max(var(--safe-area-left),0px))]">
    <p class="kb-view__state-title tw:m-0 tw:text-[15px] tw:font-semibold tw:text-content-primary">{{ t('kanban.view.boardNotFound') }}</p>
    <button type="button" class="nv-btn nv-btn--primary" @click="emit('back')">
      <ArrowLeft :size="13" /> {{ t('kanban.common.back') }}
    </button>
  </div>

  <!-- Board view -->
  <div v-else-if="board" class="kb-view tw:box-border tw:flex tw:h-full tw:w-full tw:max-w-full tw:min-w-0 tw:flex-1 tw:flex-col tw:overflow-hidden tw:bg-(--island-bg)" :class="{ 'kb-view--split': activeCard, 'kb-view--split-error': activeCard && moveError }">
    <!-- Move error banner -->
    <div v-if="moveError" class="kb-view__error-banner tw:flex tw:shrink-0 tw:items-center tw:justify-between tw:gap-2 tw:bg-surface-danger tw:px-4 tw:py-2 tw:text-xs tw:text-content-secondary">
      {{ t('kanban.view.moveFailed', { message: moveError }) }}
      <button type="button" class="nv-btn kb-view__error-close tw:grid tw:size-7 tw:shrink-0 tw:place-items-center tw:p-0" :aria-label="t('kanban.common.close')" @click="kanbanStore.moveError = null">
        <X :size="14" />
      </button>
    </div>

    <!-- Page header -->
    <div class="kb-view__header tw:flex tw:shrink-0 tw:items-center tw:gap-2 tw:px-5 tw:pt-3.5 tw:pb-2.5 tw:max-[760px]:box-border tw:max-[760px]:min-h-[calc(48px+max(var(--safe-area-top),0px))] tw:max-[760px]:pt-[calc(6px+max(var(--safe-area-top),0px))] tw:max-[760px]:pr-[calc(12px+max(var(--safe-area-right),0px))] tw:max-[760px]:pb-1 tw:max-[760px]:pl-[calc(12px+max(var(--safe-area-left),0px))]">
      <button
        type="button"
        class="nv-btn kb-view__back tw:text-content-muted tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)] tw:max-[760px]:relative tw:max-[760px]:grid tw:max-[760px]:size-9 tw:max-[760px]:shrink-0 tw:max-[760px]:place-items-center tw:max-[760px]:p-0 tw:max-[760px]:after:absolute tw:max-[760px]:after:-inset-1 tw:max-[760px]:after:content-['']"
        :aria-label="t('kanban.common.back')"
        @click="emit('back')"
      >
        <ArrowLeft :size="14" />
      </button>
      <NvNoteIcon :value="board.icon" :size="18" class="kb-view__icon tw:text-lg tw:leading-none" />
      <h1 class="kb-view__title tw:m-0 tw:min-w-0 tw:flex-1 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-xl tw:font-[650] tw:text-content-primary tw:max-[760px]:text-lg">{{ board.title }}</h1>
      <span class="kb-view__card-count tw:shrink-0 tw:font-nv-mono tw:text-[11px] tw:text-content-muted tw:max-[760px]:hidden">{{ t('kanban.view.cardCount', pluralChoice(String(locale), boardCards.length), { named: { cards: boardCards.length } }) }}</span>
    </div>

    <!-- Toolbar -->
    <KanbanToolbar
      v-model:view="activeView"
      v-model:group-by="groupBy"
      v-model:search-query="searchQuery"
      v-model:filter-rules="filterRules"
      v-model:sort-rules="sortRules"
      :filter-fields="filterFields"
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
      class="kb-view__board tw:relative tw:box-border tw:flex tw:w-full tw:max-w-full tw:min-w-0 tw:flex-1 tw:items-start tw:gap-3 tw:overflow-x-auto tw:overflow-y-hidden tw:px-[18px] tw:pt-4 tw:pb-[22px] tw:[-webkit-overflow-scrolling:touch] tw:[overscroll-behavior-inline:contain] tw:[scrollbar-color:var(--border-strong,var(--border-subtle))_transparent] tw:[scrollbar-width:thin] tw:[&::-webkit-scrollbar]:h-3 tw:[&::-webkit-scrollbar-thumb]:rounded-full tw:[&::-webkit-scrollbar-thumb]:border-2 tw:[&::-webkit-scrollbar-thumb]:border-solid tw:[&::-webkit-scrollbar-thumb]:border-transparent tw:[&::-webkit-scrollbar-thumb]:bg-[color-mix(in_oklab,var(--border-strong,var(--border-subtle))_92%,transparent)] tw:[&::-webkit-scrollbar-thumb]:[background-clip:padding-box] tw:[&::-webkit-scrollbar-track]:bg-transparent tw:max-[760px]:gap-2.5 tw:max-[760px]:pt-3 tw:max-[760px]:pr-[calc(14px+max(var(--safe-area-right),0px))] tw:max-[760px]:pb-[calc(18px+max(var(--safe-area-bottom),0px))] tw:max-[760px]:pl-[calc(14px+max(var(--safe-area-left),0px))] tw:max-[760px]:[scroll-padding-inline:calc(14px+max(var(--safe-area-left),0px))] tw:max-[760px]:[scroll-snap-type:inline_proximity]"
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
        :selected-card-id="activeCardId"
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
        <div class="kb-drop-tooltip tw:fixed tw:bottom-8 tw:left-1/2 tw:z-[300] tw:inline-flex tw:-translate-x-1/2 tw:items-center tw:gap-1.5 tw:rounded-full tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:px-3.5 tw:py-[7px] tw:text-[12.5px] tw:text-content-secondary tw:shadow-(--shadow-overlay) tw:pointer-events-none tw:[animation:kb-tooltip-in_0.15s_ease]">
          <Zap :size="12" class="kb-drop-tooltip__icon tw:shrink-0 tw:text-accent" />
          {{ t('kanban.board.dropHere') }}
          <strong>{{ dropStatusName }}</strong>
        </div>
      </Teleport>

      <!-- Add column ghost -->
      <button
        v-if="columns.length > 0"
        type="button"
        class="kb-view__add-col tw:flex tw:w-[210px] tw:shrink-0 tw:items-center tw:gap-1.5 tw:self-start tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-dashed tw:border-[var(--border-strong,var(--border-default))] tw:bg-transparent tw:px-3 tw:py-2.5 tw:font-[inherit] tw:text-xs tw:text-content-muted tw:transition-[border-color,color] tw:duration-150 tw:cursor-pointer tw:hover:border-accent tw:hover:text-accent tw:focus-visible:border-accent tw:focus-visible:outline-none tw:focus-visible:shadow-[0_0_0_2px_var(--accent-soft),0_0_0_1px_var(--accent)]"
        @click="addStatusColumn"
      >
        <Plus :size="11" />
        {{ t('kanban.view.addColumn') }}
      </button>

      <div v-if="noSearchResults" class="kb-view__no-results tw:sticky tw:left-1/2 tw:my-10 tw:mx-5 tw:flex tw:min-w-[260px] tw:shrink-0 tw:flex-col tw:items-center tw:gap-2 tw:self-center tw:text-center tw:pointer-events-none">
        <div class="kb-view__empty-icon tw:grid tw:size-11 tw:place-items-center tw:rounded-[calc(11px*var(--radius-scale,1))] tw:bg-[var(--accent-soft,rgb(161_98_7/0.12))] tw:text-accent"><Kanban :size="18" /></div>
        <p class="kb-view__empty-title tw:m-0 tw:[font-family:var(--font-serif,Georgia,serif)] tw:text-xl tw:font-normal tw:tracking-[-0.01em] tw:text-content-primary tw:italic">{{ t('kanban.view.noResultsTitle') }}</p>
        <p class="kb-view__empty-hint tw:m-0 tw:max-w-[300px] tw:text-[12.5px] tw:leading-[1.5] tw:text-[var(--text-muted,var(--text-secondary))]">{{ t('kanban.view.noResultsHint') }}</p>
      </div>

      <!-- Empty board -->
      <div v-if="columns.length === 0" class="kb-view__empty tw:m-auto tw:flex tw:flex-col tw:items-center tw:gap-2.5 tw:text-center">
        <div class="kb-view__empty-icon tw:grid tw:size-11 tw:place-items-center tw:rounded-[calc(11px*var(--radius-scale,1))] tw:bg-[var(--accent-soft,rgb(161_98_7/0.12))] tw:text-accent"><Kanban :size="20" /></div>
        <p class="kb-view__empty-title tw:m-0 tw:[font-family:var(--font-serif,Georgia,serif)] tw:text-xl tw:font-normal tw:tracking-[-0.01em] tw:text-content-primary tw:italic">{{ t('kanban.view.emptyTitle') }}</p>
        <p class="kb-view__empty-hint tw:m-0 tw:max-w-[300px] tw:text-[12.5px] tw:leading-[1.5] tw:text-[var(--text-muted,var(--text-secondary))]">{{ t('kanban.view.emptyHint') }}</p>
        <div class="kb-view__empty-actions tw:flex tw:gap-1.5">
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

    <KanbanCardEditorPane
      v-if="activeCard"
      ref="cardEditorRef"
      :card="activeCard"
      :board="board"
      @back="closeCardEditor"
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
  <div v-else class="kb-view kb-view--center tw:box-border tw:flex tw:h-full tw:w-full tw:max-w-full tw:min-w-0 tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-3 tw:overflow-hidden tw:bg-(--island-bg) tw:px-5 tw:py-8 tw:text-center tw:text-[13px] tw:text-content-muted tw:max-[760px]:pt-[calc(32px+max(var(--safe-area-top),0px))] tw:max-[760px]:pr-[calc(20px+max(var(--safe-area-right),0px))] tw:max-[760px]:pb-[calc(32px+max(var(--safe-area-bottom),0px))] tw:max-[760px]:pl-[calc(20px+max(var(--safe-area-left),0px))]">
    <p class="kb-view__state-title tw:m-0 tw:text-[15px] tw:font-semibold tw:text-content-primary">{{ t('kanban.view.boardUnavailable') }}</p>
    <div class="kb-view__state-actions tw:flex tw:items-center tw:gap-2">
      <button type="button" class="nv-btn" @click="emit('back')"><ArrowLeft :size="13" /> {{ t('kanban.common.back') }}</button>
      <button type="button" class="nv-btn nv-btn--primary" @click="retryLoad">{{ t('kanban.common.retry') }}</button>
    </div>
  </div>
</template>

<style scoped>
.kb-view--split {
  display: grid;
  grid-template-columns: clamp(620px, 45%, 760px) minmax(0, 1fr);
  grid-template-rows: auto auto minmax(0, 1fr);
}
.kb-view--split > .kb-view__header { grid-column: 1; grid-row: 1; }
.kb-view--split > :deep(.kb-toolbar) { grid-column: 1; grid-row: 2; min-width: 0; }
.kb-view--split > :deep(.kb-toolbar) { overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }
.kb-view--split > :deep(.kb-toolbar) > * { flex: 0 0 auto; }
.kb-view--split > :deep(.kb-toolbar) .kb-toolbar__spacer { display: none; }
.kb-view--split > :deep(.kb-toolbar) .kb-toolbar__group,
.kb-view--split > :deep(.kb-toolbar) .kb-toolbar__display-trigger,
.kb-view--split > :deep(.kb-toolbar) .kb-toolbar__search,
.kb-view--split > :deep(.kb-toolbar) .kb-toolbar__btn--primary,
.kb-view--split > :deep(.kb-toolbar) .kb-toolbar__btn--icon { display: none; }
.kb-view--split > :deep(.kb-toolbar) .kb-toolbar__sep { display: none; }
.kb-view--split .kb-view__card-count { display: none; }
.kb-view--split > .kb-view__board :deep(.kb-column) { width: calc((100% - 12px) / 2); min-width: calc((100% - 12px) / 2); }
.kb-view--split > .kb-view__board :deep(.kb-card--selected) {
  position: relative;
  border-color: color-mix(in oklab, var(--accent) 32%, var(--border-subtle));
  background: color-mix(in oklab, var(--accent) 6%, var(--surface-raised));
  box-shadow: none;
}
.kb-view--split > .kb-view__board :deep(.kb-card--selected)::before {
  position: absolute;
  inset: 8px auto 8px 0;
  width: 2px;
  border-radius: 0 2px 2px 0;
  background: var(--accent);
  content: '';
}
.kb-view--split > .kb-view__board :deep(.kb-card--selected:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.kb-view--split > .kb-view__board,
.kb-view--split > :deep(.kb-group),
.kb-view--split > :deep(.kb-table),
.kb-view--split > :deep(.kb-cal) { grid-column: 1; grid-row: 3; min-width: 0; }
.kb-view--split > .kb-editor-pane { grid-column: 2; grid-row: 1 / 4; }
.kb-view--split-error { grid-template-rows: auto auto auto minmax(0, 1fr); }
.kb-view--split-error > .kb-view__error-banner { grid-column: 1; grid-row: 1; }
.kb-view--split-error > .kb-view__header { grid-row: 2; }
.kb-view--split-error > :deep(.kb-toolbar) { grid-row: 3; }
.kb-view--split-error > .kb-view__board,
.kb-view--split-error > :deep(.kb-group),
.kb-view--split-error > :deep(.kb-table),
.kb-view--split-error > :deep(.kb-cal) { grid-row: 4; }
.kb-view--split-error > .kb-editor-pane { grid-row: 1 / 5; }
@media (max-width: 1300px) {
  .kb-view--split { display: flex; }
  .kb-view--split > .kb-view__header,
  .kb-view--split > :deep(.kb-toolbar),
  .kb-view--split > .kb-view__board,
  .kb-view--split > :deep(.kb-group),
  .kb-view--split > :deep(.kb-table),
  .kb-view--split > :deep(.kb-cal) { display: none; }
  .kb-view--split > .kb-editor-pane { border-left: 0; }
  .kb-view--split .kb-editor-back { display: inline-flex; }
}
@media (max-width: 760px) {
  .kb-view--split { display: flex; }
  .kb-view--split > .kb-view__header,
  .kb-view--split > :deep(.kb-toolbar),
  .kb-view--split > .kb-view__board,
  .kb-view--split > :deep(.kb-group),
  .kb-view--split > :deep(.kb-table),
  .kb-view--split > :deep(.kb-cal) { display: none; }
  .kb-view--split > .kb-editor-pane { border-left: 0; }
  .kb-view--split .kb-editor-back { display: inline-flex; }
}
/* Set/removed on <body> directly by the pointer-drag composable (not
   rendered by this component's template), so it cannot become a template
   class. */
:global(body.kb-kanban-dragging) {
  cursor: grabbing;
  user-select: none;
}

@keyframes kb-view-spin {
  to { transform: rotate(360deg); }
}

@keyframes kb-view-skeleton {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}

.kb-view__loading-rail span {
  height: 8px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--border-subtle, oklch(0.8 0 0 / 0.4)), color-mix(in oklab, var(--accent) 18%, transparent), var(--border-subtle, oklch(0.8 0 0 / 0.4)));
  background-size: 220% 100%;
  animation: kb-view-skeleton 1.2s ease-in-out infinite;
}

.kb-view__loading-rail span:nth-child(2) { width: 82%; }
.kb-view__loading-rail span:nth-child(3) { width: 64%; }

@keyframes kb-tooltip-in {
  from { opacity: 0; transform: translateX(-50%) translateY(8px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}
</style>
