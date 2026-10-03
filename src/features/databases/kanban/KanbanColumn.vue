<script setup lang="ts">
import { computed, markRaw, ref, watch, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-vue-next'
import type { KanbanBoard, KanbanBoardCardViewSettings, KanbanCard, KanbanPropertyOption } from '../../../types/kanban'
import KanbanCardVue from './KanbanCard.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import type { NvMenuItemDef } from '../../../ui/primitives/menu-types'

interface Props {
  column: KanbanPropertyOption
  cards: KanbanCard[]
  board: KanbanBoard
  draggingCardId?: string | null
  floatingCardId?: string | null
  floatingCardStyle?: CSSProperties | null
  floatingPlaceholderIndex?: number | null
  activeDropZoneIndex?: number | null
  wip?: number
  columnProgress?: number
  compact?: boolean
  canDelete?: boolean
  viewSettings?: KanbanBoardCardViewSettings
  selectedCardId?: string | null
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'add-card': [columnId: string]
  'quick-add-card': [columnId: string, title: string]
  'open-card': [cardId: string]
  'card-dragstart': [event: DragEvent, cardId: string, columnId: string]
  'card-handle-pointerdown': [event: PointerEvent, cardId: string, columnId: string]
  'drop': [event: DragEvent, columnId: string, targetIndex: number]
  'col-dragenter': [columnId: string]
  'rename-column': [columnId: string, name: string]
  'delete-column': [columnId: string]
}>()
const { t } = useI18n()

const dropZoneIndex = ref<number | null>(null)
const cardsEl = ref<HTMLDivElement | null>(null)
const isEditingName = ref(false)
const draftName = ref(props.column.name)
const quickAddOpen = ref(false)
const quickAddTitle = ref('')

watch(() => props.column.name, name => {
  if (!isEditingName.value) draftName.value = name
})

type Item = { type: 'card'; card: KanbanCard; cardIndex: number } | { type: 'zone'; zoneIndex: number }

const items = computed<Item[]>(() => {
  const out: Item[] = [{ type: 'zone', zoneIndex: 0 }]
  for (let i = 0; i < props.cards.length; i++) {
    out.push({ type: 'card', card: props.cards[i], cardIndex: i })
    out.push({ type: 'zone', zoneIndex: i + 1 })
  }
  return out
})

const isAtCap = computed(() =>
  props.wip !== undefined && props.cards.length >= props.wip
)

const progressPct = computed(() => {
  if (props.columnProgress !== undefined) return props.columnProgress
  return null
})

const columnMenuItems = computed<NvMenuItemDef[]>(() => [
  {
    label: t('kanban.view.renameColumn'),
    icon: markRaw(Pencil),
    action: startRename,
  },
  {
    label: t('kanban.view.deleteColumn'),
    icon: markRaw(Trash2),
    danger: true,
    disabled: !props.canDelete,
    action: requestDeleteColumn,
  },
])

const resolvedDropZoneIndex = computed(() => props.activeDropZoneIndex ?? dropZoneIndex.value)

function onCardDragStart(event: DragEvent, cardId: string) {
  emit('card-dragstart', event, cardId, props.column.id)
}

function onCardHandlePointerDown(event: PointerEvent, cardId: string) {
  emit('card-handle-pointerdown', event, cardId, props.column.id)
}

function onZoneDragOver(event: DragEvent, zoneIdx: number) {
  event.preventDefault()
  event.stopPropagation()
  dropZoneIndex.value = zoneIdx
}

function onZoneDrop(event: DragEvent, zoneIdx: number) {
  event.preventDefault()
  event.stopPropagation()
  dropZoneIndex.value = null
  emit('drop', event, props.column.id, zoneIdx)
}

function onColumnDragLeave(event: DragEvent) {
  const related = event.relatedTarget as HTMLElement | null
  if (related && cardsEl.value?.contains(related)) return
  dropZoneIndex.value = null
}

function onColumnDragOver(event: DragEvent) {
  event.preventDefault()
  if (props.cards.length === 0) dropZoneIndex.value = 0
  emit('col-dragenter', props.column.id)
}

function onColumnDrop(event: DragEvent) {
  if (props.cards.length === 0) {
    event.preventDefault()
    dropZoneIndex.value = null
    emit('drop', event, props.column.id, 0)
  }
}

function startRename() {
  draftName.value = props.column.name
  isEditingName.value = true
}

function submitRename() {
  const nextName = draftName.value.trim()
  isEditingName.value = false
  if (!nextName || nextName === props.column.name) {
    draftName.value = props.column.name
    return
  }
  emit('rename-column', props.column.id, nextName)
}

function cancelRename() {
  isEditingName.value = false
  draftName.value = props.column.name
}

function requestDeleteColumn() {
  emit('delete-column', props.column.id)
}

function openQuickAdd() {
  quickAddOpen.value = true
}

function submitQuickAdd() {
  const title = quickAddTitle.value.trim()
  if (!title) {
    quickAddOpen.value = false
    return
  }
  emit('quick-add-card', props.column.id, title)
  quickAddTitle.value = ''
  quickAddOpen.value = false
}

function cancelQuickAdd() {
  quickAddTitle.value = ''
  quickAddOpen.value = false
}

// Active/placeholder/idle are mutually exclusive by construction (the
// placeholder condition explicitly excludes the active index), but each
// still needs to fully own height/border/background rather than layer a
// conditional override on top of the idle base — same reasoning as every
// other idle-vs-state fix in this migration.
function dropZoneClass(zoneIndex: number) {
  const isActive = resolvedDropZoneIndex.value === zoneIndex
  if (isActive) {
    return 'kb-drop-zone--active tw:h-[34px] tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-accent tw:bg-[color-mix(in_oklab,var(--accent)_13%,transparent)]'
  }
  if (props.floatingPlaceholderIndex === zoneIndex) {
    return 'kb-drop-zone--placeholder tw:h-[34px] tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-dashed tw:border-[var(--border-strong,var(--border-default))] tw:bg-surface-subtle'
  }
  return 'tw:h-1 tw:rounded-[calc(2px*var(--radius-scale,1))]'
}
</script>

<template>
  <div
    class="kb-column tw:flex tw:w-[292px] tw:min-w-[292px] tw:shrink-0 tw:flex-col tw:overflow-visible tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--frame-bg) tw:max-[760px]:w-[clamp(280px,calc(100vw_-_32px_-_max(var(--safe-area-left),0px)_-_max(var(--safe-area-right),0px)),360px)] tw:max-[760px]:min-w-[clamp(280px,calc(100vw_-_32px_-_max(var(--safe-area-left),0px)_-_max(var(--safe-area-right),0px)),360px)] tw:max-[760px]:[scroll-snap-align:start]"
    :data-column-id="column.id"
    :data-card-count="cards.length"
    @dragover="onColumnDragOver"
    @drop="onColumnDrop"
    @dragleave="onColumnDragLeave"
  >
    <!-- Column header -->
    <div class="kb-column__header tw:flex tw:min-h-[38px] tw:flex-wrap tw:items-center tw:gap-[7px] tw:px-[9px] tw:pt-2 tw:pb-[7px]">
      <span
        class="kb-column__pill tw:inline-flex tw:h-[22px] tw:min-w-0 tw:max-w-[150px] tw:items-center tw:gap-1.5 tw:rounded-full tw:px-2"
        :style="column.color ? { '--kb-column-color': column.color } : {}"
      >
        <span class="kb-column__dot tw:size-[7px] tw:shrink-0 tw:rounded-full tw:bg-current" />
        <span class="kb-column__pill-text tw:min-w-0 tw:shrink tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[12.5px] tw:font-[550]">{{ isEditingName ? t('kanban.view.editingColumn') : column.name }}</span>
      </span>
      <input
        v-if="isEditingName"
        v-model="draftName"
        class="kb-column__name-input tw:h-7 tw:min-w-0 tw:flex-1 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2 tw:text-content-primary"
        @keydown.enter.prevent="submitRename"
        @keydown.esc.prevent="cancelRename"
        @blur="submitRename"
      />
      <span
        class="kb-column__count tw:font-nv-mono tw:text-[10.5px] tw:font-normal"
        :class="isAtCap ? 'kb-column__count--cap tw:text-danger' : 'tw:text-content-muted'"
      >
        {{ cards.length }}{{ wip !== undefined ? ` / ${wip}` : '' }}
      </span>

      <!-- Progress bar in header -->
      <div v-if="progressPct !== null" class="kb-column__progress tw:relative tw:h-[3px] tw:w-10 tw:shrink-0 tw:overflow-hidden tw:rounded-full tw:bg-[var(--hover-strong,var(--surface-overlay))]">
        <div
          class="kb-column__progress-fill tw:absolute tw:inset-y-0 tw:left-0 tw:rounded-full"
          :class="progressPct >= 1 ? 'kb-column__progress-fill--done tw:bg-[oklch(0.7_0.10_145)]' : 'tw:bg-accent'"
          :style="{ width: progressPct * 100 + '%' }"
        />
      </div>

      <!-- WIP cap warning -->
      <span v-if="isAtCap" class="kb-column__cap-warn tw:inline-flex tw:h-[17px] tw:items-center tw:rounded-full tw:border tw:border-solid tw:border-transparent tw:bg-surface-danger tw:px-1.5 tw:text-[10px] tw:font-medium tw:text-danger">{{ t('kanban.board.wipCap') }}</span>

      <div class="kb-column__spacer tw:flex-1" />
      <button
        type="button"
        class="kb-column__icon-btn tw:flex tw:size-5 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:cursor-pointer tw:hover:bg-[var(--hover-strong,var(--surface-overlay))] tw:hover:text-content-secondary tw:max-[760px]:size-11"
        :title="t('kanban.board.addCard')"
        :aria-label="t('kanban.board.addCard')"
        @click="openQuickAdd"
      >
        <Plus :size="11" />
      </button>
      <NvPopupMenu
        :items="columnMenuItems"
        placement="auto"
        :offset="[-148, 6]"
        width="168px"
      >
        <template #trigger>
          <button
            type="button"
            class="kb-column__icon-btn tw:flex tw:size-5 tw:shrink-0 tw:items-center tw:justify-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-none tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:cursor-pointer tw:hover:bg-[var(--hover-strong,var(--surface-overlay))] tw:hover:text-content-secondary tw:max-[760px]:size-11"
            :title="t('kanban.view.columnMenu')"
            :aria-label="t('kanban.view.columnMenu')"
          >
            <MoreHorizontal :size="13" />
          </button>
        </template>
      </NvPopupMenu>
    </div>

    <!-- Cards list -->
    <div
      ref="cardsEl"
      class="kb-column__cards tw:flex tw:flex-1 tw:flex-col tw:gap-px tw:overflow-y-auto tw:px-2 tw:pt-[7px] tw:pb-[5px]"
      :class="cards.length === 0 ? 'kb-column__cards--empty tw:min-h-20' : 'tw:min-h-12'"
    >
      <template
        v-for="item in items"
        :key="item.type === 'card' ? item.card.id : `zone-${item.zoneIndex}`"
      >
        <KanbanCardVue
          v-if="item.type === 'card'"
          :card="item.card"
          :board="board"
          :is-dragging="draggingCardId === item.card.id"
          :is-floating-drag="floatingCardId === item.card.id"
          :is-selected="selectedCardId === item.card.id"
          :floating-style="floatingCardId === item.card.id ? floatingCardStyle ?? undefined : undefined"
          :compact="compact"
          :view-settings="viewSettings"
          @click="emit('open-card', item.card.id)"
          @dragstart="onCardDragStart"
          @handle-pointerdown="onCardHandlePointerDown"
        />
        <div
          v-else
          class="kb-drop-zone tw:mx-px tw:my-0.5 tw:transition-[height,background-color] tw:duration-[120ms]"
          :class="dropZoneClass(item.zoneIndex)"
          :data-column-id="column.id"
          :data-drop-zone-index="item.zoneIndex"
          @dragover="onZoneDragOver($event, item.zoneIndex)"
          @dragleave.stop="dropZoneIndex = null"
          @drop="onZoneDrop($event, item.zoneIndex)"
        />
      </template>

      <!-- Empty column state -->
      <div v-if="cards.length === 0 && resolvedDropZoneIndex === null" class="kb-column__empty tw:my-1 tw:flex tw:min-h-[60px] tw:flex-1 tw:items-center tw:justify-center tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-dashed tw:border-[var(--border-default,var(--border-subtle))] tw:bg-transparent">
        <div class="kb-column__empty-hint tw:text-[11.5px] tw:text-content-muted">{{ t('kanban.board.emptyColumn') }}</div>
      </div>
    </div>

    <form
      v-if="quickAddOpen"
      class="kb-column__quick-add tw:flex tw:flex-col tw:gap-[7px] tw:px-2 tw:pt-[7px] tw:pb-[9px]"
      @submit.prevent="submitQuickAdd"
    >
      <input
        v-model="quickAddTitle"
        class="kb-column__quick-input tw:box-border tw:h-8 tw:w-full tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:px-2.5 tw:text-[12.5px] tw:text-content-primary tw:outline-none tw:focus:border-accent"
        :placeholder="t('kanban.board.quickAddPlaceholder')"
        autofocus
        @keydown.esc.prevent="cancelQuickAdd"
      />
      <div class="kb-column__quick-actions tw:flex tw:items-center tw:gap-1.5">
        <button type="submit" class="nv-btn nv-btn--primary">{{ t('kanban.board.newCard') }}</button>
        <button type="button" class="nv-btn" @click="cancelQuickAdd">{{ t('kanban.common.cancel') }}</button>
      </div>
    </form>

    <button
      v-else
      type="button"
      class="kb-column__add-btn tw:flex tw:w-full tw:items-center tw:gap-[5px] tw:border-none tw:bg-transparent tw:px-3 tw:py-2 tw:text-left tw:text-[11.5px] tw:text-content-muted tw:transition-colors tw:duration-100 tw:cursor-pointer tw:hover:bg-[var(--hover,var(--surface-raised))] tw:hover:text-content-secondary tw:max-[760px]:min-h-11"
      @click="openQuickAdd"
    >
      <Plus :size="11" />
      <span>{{ t('kanban.board.quickAdd') }}</span>
    </button>
  </div>
</template>

<style scoped>
/* The pill's tint is a runtime per-column accent (column.color, applied via
   an inline `:style` CSS-variable override) with a default fallback that
   only a CSS custom-property declaration can express as the base for
   color-mix() — keeping the whole rule here avoids inventing an unproven
   `tw:[--custom-prop:value]` arbitrary-property pattern with no other
   precedent in this codebase. */
.kb-column__pill {
  --kb-column-color: var(--text-muted, var(--text-muted));
  background: color-mix(in oklab, var(--kb-column-color) 14%, transparent);
  color: var(--kb-column-color);
}
</style>
