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
</script>

<template>
  <div
    class="kb-column"
    :data-column-id="column.id"
    :data-card-count="cards.length"
    @dragover="onColumnDragOver"
    @drop="onColumnDrop"
    @dragleave="onColumnDragLeave"
  >
    <!-- Column header -->
    <div class="kb-column__header">
      <span
        class="kb-column__pill"
        :style="column.color ? { '--kb-column-color': column.color } : {}"
      >
        <span class="kb-column__dot" />
        <span class="kb-column__pill-text">{{ isEditingName ? t('kanban.view.editingColumn') : column.name }}</span>
      </span>
      <input
        v-if="isEditingName"
        v-model="draftName"
        class="kb-column__name-input"
        @keydown.enter.prevent="submitRename"
        @keydown.esc.prevent="cancelRename"
        @blur="submitRename"
      />
      <span class="kb-column__count" :class="{ 'kb-column__count--cap': isAtCap }">
        {{ cards.length }}{{ wip !== undefined ? ` / ${wip}` : '' }}
      </span>

      <!-- Progress bar in header -->
      <div v-if="progressPct !== null" class="kb-column__progress">
        <div
          class="kb-column__progress-fill"
          :class="{ 'kb-column__progress-fill--done': progressPct >= 1 }"
          :style="{ width: progressPct * 100 + '%' }"
        />
      </div>

      <!-- WIP cap warning -->
      <span v-if="isAtCap" class="kb-column__cap-warn">{{ t('kanban.board.wipCap') }}</span>

      <div class="kb-column__spacer" />
      <button
        type="button"
        class="kb-column__icon-btn"
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
            class="kb-column__icon-btn"
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
      class="kb-column__cards"
      :class="{ 'kb-column__cards--empty': cards.length === 0 }"
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
          :floating-style="floatingCardId === item.card.id ? floatingCardStyle ?? undefined : undefined"
          :compact="compact"
          :view-settings="viewSettings"
          @click="emit('open-card', item.card.id)"
          @dragstart="onCardDragStart"
          @handle-pointerdown="onCardHandlePointerDown"
        />
        <div
          v-else
          class="kb-drop-zone"
          :class="{
            'kb-drop-zone--active': resolvedDropZoneIndex === item.zoneIndex,
            'kb-drop-zone--placeholder': floatingPlaceholderIndex === item.zoneIndex && resolvedDropZoneIndex !== item.zoneIndex,
          }"
          :data-column-id="column.id"
          :data-drop-zone-index="item.zoneIndex"
          @dragover="onZoneDragOver($event, item.zoneIndex)"
          @dragleave.stop="dropZoneIndex = null"
          @drop="onZoneDrop($event, item.zoneIndex)"
        />
      </template>

      <!-- Empty column state -->
      <div v-if="cards.length === 0 && resolvedDropZoneIndex === null" class="kb-column__empty">
        <div class="kb-column__empty-hint">{{ t('kanban.board.emptyColumn') }}</div>
      </div>
    </div>

    <form
      v-if="quickAddOpen"
      class="kb-column__quick-add"
      @submit.prevent="submitQuickAdd"
    >
      <input
        v-model="quickAddTitle"
        class="kb-column__quick-input"
        :placeholder="t('kanban.board.quickAddPlaceholder')"
        autofocus
        @keydown.esc.prevent="cancelQuickAdd"
      />
      <div class="kb-column__quick-actions">
        <button type="submit" class="nv-btn nv-btn--primary">{{ t('kanban.board.newCard') }}</button>
        <button type="button" class="nv-btn" @click="cancelQuickAdd">{{ t('kanban.common.cancel') }}</button>
      </div>
    </form>

    <button
      v-else
      type="button"
      class="kb-column__add-btn"
      @click="openQuickAdd"
    >
      <Plus :size="11" />
      <span>{{ t('kanban.board.quickAdd') }}</span>
    </button>
  </div>
</template>

<style scoped>
.kb-column {
  display: flex;
  flex-direction: column;
  width: 292px;
  min-width: 292px;
  background: color-mix(in oklab, var(--glass-2, var(--surface-0)) 90%, transparent);
  border-radius: 8px;
  border: 1px solid var(--line-1, var(--border-subtle));
  overflow: visible;
  flex-shrink: 0;
}

/* Header */
.kb-column__header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 9px 7px;
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  flex-wrap: wrap;
  min-height: 38px;
}

.kb-column__pill {
  --kb-column-color: var(--text-3, var(--text-muted));
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 150px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  background: color-mix(in oklab, var(--kb-column-color) 14%, transparent);
  color: var(--kb-column-color);
}

.kb-column__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.kb-column__pill-text {
  font-size: 12.5px;
  font-weight: 550;
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-column__name-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border-radius: 6px;
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--glass-3, var(--surface-1));
  color: var(--text-1, var(--text-primary));
}

.kb-column__count {
  font-size: 10.5px;
  font-weight: 400;
  color: var(--text-4, var(--text-muted));
  font-family: var(--font-mono, monospace);
}

.kb-column__count--cap {
  color: oklch(0.55 0.13 22);
}

/* Inline progress in header */
.kb-column__progress {
  height: 3px;
  width: 40px;
  border-radius: 999px;
  background: var(--hover-strong, var(--surface-2));
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}

.kb-column__progress-fill {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--accent);
  border-radius: 999px;
}

.kb-column__progress-fill--done { background: oklch(0.7 0.10 145); }

/* Cap warning badge */
.kb-column__cap-warn {
  display: inline-flex;
  align-items: center;
  height: 17px;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 500;
  background: oklch(0.7 0.13 22 / 0.12);
  color: oklch(0.55 0.13 22);
  border: 1px solid oklch(0.7 0.13 22 / 0.25);
}

.kb-column__spacer { flex: 1; }

.kb-column__icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  background: none;
  border: none;
  color: var(--text-4, var(--text-muted));
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  flex-shrink: 0;
}

.kb-column__icon-btn:hover {
  background: var(--hover-strong, var(--surface-2));
  color: var(--text-2, var(--text-secondary));
}

/* Cards list */
.kb-column__cards {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 7px 8px 5px;
  overflow-y: auto;
  min-height: 48px;
  gap: 1px;
}

/* Empty drop zone target */
.kb-column__cards--empty {
  min-height: 80px;
}

.kb-column__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 60px;
  border: 1px dashed var(--line-2, var(--border-subtle));
  border-radius: 8px;
  margin: 4px 0;
  background: color-mix(in oklab, var(--surface-1) 58%, transparent);
}

.kb-column__empty-hint {
  font-size: 11.5px;
  color: var(--text-4, var(--text-muted));
}

/* Drop zones */
.kb-drop-zone {
  height: 4px;
  border-radius: 2px;
  margin: 2px 1px;
  transition: height 0.12s ease, background 0.12s ease;
}

.kb-drop-zone--active {
  height: 34px;
  background: color-mix(in oklab, var(--accent) 13%, transparent);
  border: 1px solid var(--accent);
  border-radius: 7px;
  box-shadow: 0 0 10px var(--accent-glow, oklch(0.66 0.10 258 / 0.18));
}

.kb-drop-zone--placeholder {
  height: 34px;
  border: 1px dashed var(--line-strong, var(--border-muted));
  border-radius: 7px;
  background: color-mix(in oklab, var(--surface-1) 84%, transparent);
}

.kb-column__quick-add {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 7px 8px 9px;
  border-top: 1px solid var(--line-1, var(--border-subtle));
}

.kb-column__quick-input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--glass-3, var(--surface-1));
  color: var(--text-1, var(--text-primary));
  font-size: 12.5px;
  outline: none;
  box-sizing: border-box;
}

.kb-column__quick-input:focus {
  border-color: var(--accent);
}

.kb-column__quick-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kb-column__add-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  border-top: 1px solid var(--line-1, var(--border-subtle));
  color: var(--text-4, var(--text-muted));
  font-size: 11.5px;
  cursor: pointer;
  transition: color 0.1s, background 0.1s;
  text-align: left;
}

.kb-column__add-btn:hover {
  color: var(--text-2, var(--text-secondary));
  background: var(--hover, var(--surface-1));
}
</style>
