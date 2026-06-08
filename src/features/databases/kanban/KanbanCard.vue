<script setup lang="ts">
import { computed, ref, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { GripVertical } from 'lucide-vue-next'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { KanbanBoard, KanbanBoardCardViewSettings, KanbanCard, KanbanCardField, KanbanCardPriority } from '../../../types/kanban'
import { getBoardStatusProperty, getCardStatusValue, computeTaskProgress } from './kanbanFields'

interface Props {
  card: KanbanCard
  board: KanbanBoard
  viewSettings?: KanbanBoardCardViewSettings
  isDragging?: boolean
  isFloatingDrag?: boolean
  floatingStyle?: CSSProperties
  isSelected?: boolean
  isHighlighted?: boolean
  compact?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'click': [cardId: string]
  'dragstart': [event: DragEvent, cardId: string]
  'handle-pointerdown': [event: PointerEvent, cardId: string]
}>()
const cardEl = ref<HTMLDivElement | null>(null)
const { t, locale } = useI18n()

const safeFields = computed(() => Array.isArray(props.card.fields) ? props.card.fields : [])
const settings = computed<KanbanBoardCardViewSettings>(() => ({
  showCardPreview: true,
  cardDensity: 'comfortable',
  ...(props.board.viewSettings?.board ?? {}),
  ...(props.viewSettings ?? {}),
}))
const isCompactCard = computed(() => props.compact || settings.value.cardDensity === 'compact')

const statusProp = computed(() => getBoardStatusProperty(props.board))
const statusOption = computed(() => {
  if (!statusProp.value) return null
  const val = getCardStatusValue(props.card, props.board)
  if (!val) return null
  return statusProp.value.options?.find(o => o.id === val) ?? null
})

const visiblePropertySet = computed(() => {
  const ids = settings.value.visiblePropertyIds
  return Array.isArray(ids) ? new Set(ids) : null
})
const propertyOrderMap = computed(() => {
  const map = new Map<string, number>()
  for (const [index, id] of (settings.value.propertyOrder ?? []).entries()) map.set(id, index)
  return map
})

const visibleProperties = computed(() => {
  const visibleSet = visiblePropertySet.value
  const limit = isCompactCard.value ? 2 : 5

  return safeFields.value
    .filter(field => hasRenderableValue(field) && (!visibleSet || visibleSet.has(field.id)))
    .sort((a, b) => {
      const orderA = propertyOrderMap.value.get(a.id) ?? a.order
      const orderB = propertyOrderMap.value.get(b.id) ?? b.order
      return orderA - orderB
    })
    .slice(0, limit)
})

const previewText = computed(() => {
  if (settings.value.showCardPreview === false || isCompactCard.value) return ''
  return extractText(props.card.content).replace(/\s+/g, ' ').trim().slice(0, 128)
})

function hasRenderableValue(field: KanbanCardField) {
  const value = field.value
  if (value === null || value === undefined || value === '') return false
  if (Array.isArray(value) && value.length === 0) return false
  return true
}

function formatFieldValue(field: KanbanCardField): string {
  const value = field.value
  if (field.type === 'checkbox') return value === true ? t('kanban.card.checked') : t('kanban.card.unchecked')
  if (field.type === 'date' && typeof value === 'string') return formatDate(value)
  if (field.type === 'select' && typeof value === 'string') return field.options?.find(option => option.id === value)?.name ?? value
  if (field.type === 'multi_select' && Array.isArray(value)) {
    return value
      .map(optionId => field.options?.find(option => option.id === optionId)?.name ?? optionId)
      .join(', ')
  }
  return String(value)
}

function fieldColor(field: KanbanCardField): string | undefined {
  const value = field.value
  if (field.type === 'select' && typeof value === 'string') return field.options?.find(option => option.id === value)?.color
  if (field.type === 'multi_select' && Array.isArray(value)) {
    const first = field.options?.find(option => option.id === value[0])
    return first?.color
  }
  return undefined
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (isNaN(date.getTime())) return iso
  return date.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })
}

function extractText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const record = node as Record<string, unknown>
  const ownText = typeof record.text === 'string' ? record.text : ''
  const children = Array.isArray(record.content)
    ? record.content.map(child => extractText(child)).join(' ')
    : ''
  return `${ownText} ${children}`.trim()
}

function onDragStart(event: DragEvent) {
  if (event.dataTransfer && cardEl.value) {
    event.dataTransfer.setDragImage(cardEl.value, 24, 24)
  }
  emit('dragstart', event, props.card.id)
}

function onHandlePointerDown(event: PointerEvent) {
  emit('handle-pointerdown', event, props.card.id)
}

const PRIORITY_COLORS: Record<KanbanCardPriority, string> = {
  none: 'var(--text-4, #9ca3af)',
  low: '#3b82f6',
  medium: '#f59e0b',
  high: '#f97316',
  urgent: '#ef4444',
}

const priorityColor = computed(() => {
  const p = props.card.priority
  if (!p || p === 'none') return null
  return PRIORITY_COLORS[p] ?? null
})

const taskProgress = computed(() => computeTaskProgress(props.card.content))
const progressValue = computed(() => taskProgress.value?.pct ?? null)
</script>

<template>
  <div
    ref="cardEl"
    class="kb-card"
    :class="{
      'kb-card--dragging': isDragging,
      'kb-card--floating': isFloatingDrag,
      'kb-card--selected': isSelected,
      'kb-card--highlight': isHighlighted,
      'kb-card--compact': isCompactCard,
    }"
    :style="floatingStyle"
    draggable="true"
    tabindex="0"
    @dragstart="onDragStart"
    @click="emit('click', card.id)"
    @keydown.enter.prevent="emit('click', card.id)"
  >
    <div
      class="kb-card__handle"
      :title="t('kanban.board.dragCard')"
      :aria-label="t('kanban.board.dragCard')"
      @click.stop
      @pointerdown.stop.prevent="onHandlePointerDown"
    >
      <GripVertical :size="12" />
    </div>

    <div class="kb-card__inner">
      <div v-if="(statusOption && !isCompactCard) || priorityColor" class="kb-card__status-row">
        <span
          v-if="statusOption && !isCompactCard"
          class="kb-card__status"
          :style="statusOption.color
            ? { background: statusOption.color + '22', color: statusOption.color }
            : {}"
        >
          <span
            class="kb-card__status-dot"
            :style="statusOption.color ? { background: statusOption.color } : {}"
          />
          {{ statusOption.name }}
        </span>
        <span
          v-if="priorityColor"
          class="kb-card__priority"
          :style="{ background: priorityColor + '22', color: priorityColor }"
        >
          <span class="kb-card__priority-dot" :style="{ background: priorityColor }" />
          {{ t(`kanban.card.priorityLevels.${card.priority}`) }}
        </span>
      </div>

      <div class="kb-card__title">
        <NvNoteIcon v-if="card.icon" :value="card.icon" :size="13" class="kb-card__icon" />
        <span>{{ card.title || t('kanban.card.untitled') }}</span>
      </div>

      <p v-if="previewText" class="kb-card__preview">{{ previewText }}</p>

      <div v-if="visibleProperties.length" class="kb-card__properties">
        <div
          v-for="field in visibleProperties"
          :key="field.id"
          class="kb-card__property"
        >
          <span class="kb-card__property-name">{{ field.name }}</span>
          <span
            class="kb-card__property-value"
            :style="fieldColor(field) ? { color: fieldColor(field), background: fieldColor(field) + '18' } : {}"
          >
            {{ formatFieldValue(field) }}
          </span>
        </div>
      </div>

      <div v-if="progressValue !== null" class="kb-card__progress">
        <div class="kb-card__progress-fill" :style="{ width: progressValue + '%' }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-card {
  position: relative;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  border-radius: 8px;
  background: color-mix(in oklab, var(--glass-3, var(--surface-1)) 92%, transparent);
  border: 1px solid var(--line-2, var(--border-subtle));
  cursor: pointer;
  user-select: none;
  overflow: hidden;
  transition:
    box-shadow 0.15s ease,
    border-color 0.15s ease,
    background 0.15s ease,
    transform 0.15s ease;
}

.kb-card:hover,
.kb-card:focus-visible {
  border-color: var(--line-strong, var(--border-muted));
  box-shadow: 0 10px 26px -18px oklch(0 0 0 / 0.55);
  outline: none;
}

.kb-card--selected {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft), var(--shadow-1, 0 2px 8px oklch(0 0 0 / 0.1));
}

.kb-card--highlight {
  background: oklch(0.66 0.10 258 / 0.08);
  border-color: oklch(0.66 0.10 258 / 0.30);
}

.kb-card--dragging {
  border-color: var(--accent);
}

.kb-card--dragging:not(.kb-card--floating) {
  transform: rotate(-1.2deg) translateY(-3px) scale(1.012);
  box-shadow:
    0 22px 48px -8px oklch(0 0 0 / 0.45),
    0 0 0 1.5px oklch(0.66 0.10 258 / 0.55);
  z-index: 10;
  pointer-events: none;
}

.kb-card--floating {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 2400;
  pointer-events: none;
  cursor: grabbing;
  will-change: transform;
  transform-origin: 18px 18px;
  transition:
    box-shadow 0.12s ease,
    border-color 0.12s ease,
    background 0.12s ease;
  box-shadow:
    0 28px 70px -18px oklch(0 0 0 / 0.52),
    0 0 0 1.5px oklch(0.66 0.10 258 / 0.45);
  background: color-mix(in oklab, var(--glass-3, var(--surface-1)) 92%, white 8%);
}

.kb-card__handle {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 20px;
  padding-top: 12px;
  flex-shrink: 0;
  color: var(--text-4, var(--text-muted));
  opacity: 0;
  cursor: grab;
  transition: opacity 0.12s, color 0.12s;
}

.kb-card:hover .kb-card__handle,
.kb-card:focus-visible .kb-card__handle,
.kb-card--dragging .kb-card__handle {
  opacity: 1;
}

.kb-card__handle:active { cursor: grabbing; }

.kb-card__inner {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 11px 11px 2px;
}

.kb-card--compact .kb-card__inner {
  gap: 5px;
  padding: 8px 10px 8px 2px;
}

.kb-card__status-row {
  display: flex;
  align-items: center;
}

.kb-card__status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 500;
  background: var(--hover-strong, var(--surface-2));
  color: var(--text-3, var(--text-secondary));
}

.kb-card__status-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--text-3, currentColor);
  flex-shrink: 0;
}

.kb-card__priority {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 18px;
  padding: 0 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 500;
}

.kb-card__priority-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  flex-shrink: 0;
}

.kb-card__title {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
  color: var(--text-1, var(--text-primary));
  font-size: 13px;
  font-weight: 560;
  line-height: 1.35;
  word-break: break-word;
}

.kb-card--compact .kb-card__title {
  font-size: 12.5px;
}

.kb-card__icon {
  font-size: 13px;
  flex-shrink: 0;
  line-height: 1.35;
}

.kb-card__preview {
  margin: 0;
  color: var(--text-3, var(--text-secondary));
  font-size: 11.5px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.kb-card__properties {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 2px;
}

.kb-card__property {
  display: grid;
  grid-template-columns: minmax(58px, 0.45fr) minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 18px;
}

.kb-card__property-name,
.kb-card__property-value {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 10.5px;
}

.kb-card__property-name {
  color: var(--text-4, var(--text-muted));
}

.kb-card__property-value {
  justify-self: start;
  max-width: 100%;
  padding: 1px 5px;
  border-radius: 4px;
  color: var(--text-2, var(--text-secondary));
  background: var(--hover, var(--surface-1));
}

.kb-card__progress {
  height: 3px;
  border-radius: 999px;
  background: var(--line-2, var(--border-subtle));
  overflow: hidden;
  margin-top: 2px;
}

.kb-card__progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent, #3b82f6);
  transition: width 0.2s ease;
}

@media (prefers-reduced-motion: reduce) {
  .kb-card {
    transition: none;
  }
  .kb-card__progress-fill {
    transition: none;
  }
}
</style>
