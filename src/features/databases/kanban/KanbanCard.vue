<script setup lang="ts">
import { computed, ref, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'
import { GripVertical } from '@lucide/vue'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { KanbanBoard, KanbanBoardCardViewSettings, KanbanCard, KanbanCardField, KanbanCardPriority, KanbanPropertyOption } from '../../../types/kanban'
import { getBoardStatusProperty, getCardStatusValue, computeTaskProgress, localizeDefaultKanbanLabel } from './kanbanFields'

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
  // Set when the card sits in a column of the status property: the column already conveys the status.
  hideStatus?: boolean
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

const showStatusChip = computed(() => !!statusOption.value && !isCompactCard.value && !props.hideStatus)
const statusLabel = computed(() => statusOption.value ? localizeDefaultKanbanLabel(statusOption.value.name, key => t(key)) : '')

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
    .filter(field => {
      const name = field.name.toLowerCase().trim()
      const isTagsField = field.type === 'multi_select' && (name === 'tags' || name === 'теги')
      return !isTagsField && hasRenderableValue(field) && (!visibleSet || visibleSet.has(field.id))
    })
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
  none: 'var(--text-muted, #9ca3af)',
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

const cardTags = computed(() => {
  const field = safeFields.value.find(f => {
    const name = f.name.toLowerCase().trim()
    return f.type === 'multi_select' && (name === 'tags' || name === 'теги')
  })
  if (!field || !Array.isArray(field.value)) return []
  return field.value
    .map(valId => field.options?.find(opt => opt.id === valId))
    .filter((opt): opt is KanbanPropertyOption => !!opt)
})

const TAG_COLORS = [
  { text: '#3b82f6', bg: '#3b82f618', border: '#3b82f630' },
  { text: '#10b981', bg: '#10b98118', border: '#10b98130' },
  { text: '#f59e0b', bg: '#f59e0b18', border: '#f59e0b30' },
  { text: '#ef4444', bg: '#ef444418', border: '#ef444430' },
  { text: '#8b5cf6', bg: '#8b5cf618', border: '#8b5cf630' },
  { text: '#ec4899', bg: '#ec489918', border: '#ec489930' },
  { text: '#06b6d4', bg: '#06b6d418', border: '#06b6d430' },
  { text: '#f97316', bg: '#f9731618', border: '#f9731630' },
]

// The root element combines several booleans that don't nest into one
// simple state machine — a card can be selected *and* highlighted *and*
// dragging at once — so each affected CSS property is resolved with its own
// priority ladder, mirroring the exact specificity/source-order outcome the
// original CSS produced, rather than folding everything into one ternary
// and losing a real combination. `:hover`/`:focus-visible` stay real
// pseudo-variants (unconditional, applied in the template) since they are
// browser-driven state this component cannot see in script — their higher
// real specificity (0,2,0) already deterministically overrides every one of
// these plain state classes (0,1,0) for border-color/box-shadow exactly as
// the original CSS did, except for the one case noted below.
const borderColorClass = computed(() => {
  // dragging (also true while floating) beats highlight beats selected —
  // matches the original's later-wins source order at equal specificity.
  if (props.isDragging) return 'tw:border-accent'
  if (props.isHighlighted) return 'tw:border-[color-mix(in_oklab,var(--accent)_60%,transparent)]'
  if (props.isSelected) return 'tw:border-accent'
  return 'tw:border-transparent'
})

const backgroundClass = computed(() => {
  // Only highlight and the floating ghost touch background; floating's own
  // rule (surface-raised, same as idle) comes after highlight's in the
  // original source, so it would win, but the values are identical anyway.
  if (!props.isFloatingDrag && props.isHighlighted) return 'tw:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]'
  return 'tw:bg-surface-raised'
})

const boxShadowClass = computed(() => {
  // The floating ghost and "dragging, not floating" box-shadows come from
  // mutually exclusive selectors in the original (the dragging rule is
  // `:not(.kb-card--floating)`), so floating always wins when both are true.
  // NOTE: unlike selected's box-shadow, the original dragging/floating rules
  // have a real specificity (or source-order) edge over `:hover`, which a
  // flat ternary utility cannot reproduce — an active drag is not a
  // realistically hoverable state on any platform this app ships to, so
  // this is an accepted, deliberate simplification.
  if (props.isFloatingDrag) return 'tw:shadow-[0_28px_70px_-18px_oklch(0_0_0/0.52),0_0_0_1.5px_color-mix(in_oklab,var(--accent)_52%,transparent)]'
  if (props.isDragging) return 'tw:shadow-[0_22px_48px_-8px_oklch(0_0_0/0.45),0_0_0_1.5px_color-mix(in_oklab,var(--accent)_62%,transparent)]'
  if (props.isSelected) return 'tw:shadow-[0_0_0_2px_var(--accent),var(--shadow-raised)]'
  return ''
})

// Position/transform/cursor are genuinely mutually exclusive between the
// floating ghost and an in-place dragging card (the floating rule excludes
// the dragging-not-floating rule via `:not()`), so a single ternary is
// correct here.
const dragPositionClass = computed(() => {
  if (props.isFloatingDrag) {
    return 'tw:fixed tw:top-0 tw:left-0 tw:z-[2400] tw:pointer-events-none tw:cursor-grabbing tw:will-change-transform tw:[transform-origin:18px_18px]'
  }
  if (props.isDragging) {
    return 'tw:rotate-[-1.2deg] tw:-translate-y-[3px] tw:scale-[1.012] tw:z-10 tw:pointer-events-none'
  }
  return 'tw:cursor-pointer'
})

// Pure hooks: no styling of their own left (everything above owns the
// properties instead), kept so tests and any user `.nevo/custom.css` can
// still target these state names.
const stateHookClasses = computed(() => [
  props.isDragging && 'kb-card--dragging',
  props.isFloatingDrag && 'kb-card--floating',
  props.isSelected && 'kb-card--selected',
  props.isHighlighted && 'kb-card--highlight',
  isCompactCard.value && 'kb-card--compact',
].filter(Boolean).join(' '))

function getTagColorStyle(tag: KanbanPropertyOption) {
  if (tag.color) {
    return {
      color: tag.color,
      background: tag.color + '18',
      borderColor: tag.color + '30',
    }
  }
  let hash = 0
  const name = tag.name
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % TAG_COLORS.length
  return {
    color: TAG_COLORS[index].text,
    background: TAG_COLORS[index].bg,
    borderColor: TAG_COLORS[index].border,
  }
}
</script>

<template>
  <div
    ref="cardEl"
    class="kb-card tw:group tw:relative tw:flex tw:flex-row tw:items-stretch tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:select-none tw:overflow-hidden tw:transition-[box-shadow,border-color,background-color,transform] tw:duration-150 tw:motion-reduce:transition-none tw:hover:border-transparent tw:focus-visible:border-transparent tw:hover:shadow-[0_0_0_2px_var(--focus-ring),var(--shadow-raised)] tw:focus-visible:shadow-[0_0_0_2px_var(--focus-ring),var(--shadow-raised)] tw:focus-visible:outline-none"
    :class="[stateHookClasses, borderColorClass, backgroundClass, boxShadowClass, dragPositionClass]"
    :style="floatingStyle"
    draggable="true"
    tabindex="0"
    @dragstart="onDragStart"
    @click="emit('click', card.id)"
    @keydown.enter.prevent="emit('click', card.id)"
  >
    <div
      class="kb-card__handle tw:flex tw:w-5 tw:shrink-0 tw:items-start tw:justify-center tw:pt-3 tw:text-content-muted tw:cursor-grab tw:transition-[opacity,color] tw:duration-[120ms] tw:active:cursor-grabbing tw:group-hover:opacity-100 tw:group-focus-visible:opacity-100"
      :class="isDragging ? 'tw:opacity-100' : 'tw:opacity-0'"
      :title="t('kanban.board.dragCard')"
      :aria-label="t('kanban.board.dragCard')"
      @click.stop
      @pointerdown.stop.prevent="onHandlePointerDown"
    >
      <GripVertical :size="12" />
    </div>

    <div
      class="kb-card__inner tw:flex tw:min-w-0 tw:flex-1 tw:flex-col"
      :class="isCompactCard ? 'tw:gap-[5px] tw:py-2 tw:pr-2.5 tw:pl-0.5 tw:max-[760px]:py-2.5' : 'tw:gap-[7px] tw:pt-2.5 tw:pr-[11px] tw:pb-[11px] tw:pl-0.5 tw:max-[760px]:py-3'"
    >
      <div v-if="showStatusChip || priorityColor" class="kb-card__status-row tw:flex tw:items-center">
        <span
          v-if="statusOption && showStatusChip"
          class="kb-card__status tw:inline-flex tw:h-[18px] tw:items-center tw:gap-[5px] tw:rounded-full tw:bg-[var(--hover-strong,var(--surface-overlay))] tw:px-[7px] tw:text-[10.5px] tw:font-medium tw:text-[var(--text-muted,var(--text-secondary))]"
          :style="statusOption.color
            ? { background: statusOption.color + '22', color: statusOption.color }
            : {}"
        >
          <span
            class="kb-card__status-dot tw:size-1.5 tw:shrink-0 tw:rounded-full tw:bg-[var(--text-muted,currentColor)]"
            :style="statusOption.color ? { background: statusOption.color } : {}"
          />
          {{ statusLabel }}
        </span>
        <span
          v-if="priorityColor"
          class="kb-card__priority tw:inline-flex tw:h-[18px] tw:items-center tw:gap-[5px] tw:rounded-full tw:px-[7px] tw:text-[10.5px] tw:font-medium"
          :style="{ background: priorityColor + '22', color: priorityColor }"
        >
          <span class="kb-card__priority-dot tw:size-1.5 tw:shrink-0 tw:rounded-full" :style="{ background: priorityColor }" />
          {{ t(`kanban.card.priorityLevels.${card.priority}`) }}
        </span>
      </div>

      <div
        class="kb-card__title tw:flex tw:min-w-0 tw:items-start tw:gap-1.5 tw:text-content-primary tw:font-[560] tw:leading-[1.35] tw:break-words"
        :class="isCompactCard ? 'tw:text-[12.5px]' : 'tw:text-[13px]'"
      >
        <NvNoteIcon v-if="card.icon" :value="card.icon" :size="13" class="kb-card__icon tw:shrink-0 tw:text-[13px] tw:leading-[1.35]" />
        <span>{{ card.title || t('kanban.card.untitled') }}</span>
      </div>

      <div v-if="cardTags.length" class="kb-card__tags tw:mt-px tw:flex tw:flex-wrap tw:gap-1">
        <span
          v-for="tag in cardTags"
          :key="tag.id"
          class="kb-card__tag tw:inline-flex tw:items-center tw:rounded-full tw:border tw:border-solid tw:border-transparent tw:px-1.5 tw:py-px tw:text-[10px] tw:leading-[1.2] tw:font-medium"
          :style="getTagColorStyle(tag)"
        >
          {{ tag.name }}
        </span>
      </div>

      <p v-if="previewText" class="kb-card__preview tw:m-0 tw:line-clamp-2 tw:text-[11.5px] tw:leading-[1.4] tw:text-[var(--text-muted,var(--text-secondary))]">{{ previewText }}</p>

      <div v-if="visibleProperties.length" class="kb-card__properties tw:flex tw:flex-col tw:gap-[5px] tw:pt-0.5">
        <div
          v-for="field in visibleProperties"
          :key="field.id"
          class="kb-card__property tw:grid tw:min-h-[18px] tw:grid-cols-[minmax(58px,0.45fr)_minmax(0,1fr)] tw:items-center tw:gap-2"
        >
          <span class="kb-card__property-name tw:min-w-0 tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:text-[10.5px] tw:text-content-muted">{{ field.name }}</span>
          <span
            class="kb-card__property-value tw:min-w-0 tw:max-w-full tw:justify-self-start tw:overflow-hidden tw:text-ellipsis tw:whitespace-nowrap tw:rounded-[calc(4px*var(--radius-scale,1))] tw:bg-[var(--hover,var(--surface-raised))] tw:px-[5px] tw:py-px tw:text-[10.5px] tw:text-content-secondary"
            :style="fieldColor(field) ? { color: fieldColor(field), background: fieldColor(field) + '18' } : {}"
          >
            {{ formatFieldValue(field) }}
          </span>
        </div>
      </div>

      <div v-if="taskProgress !== null" class="kb-card__progress-container tw:mt-0.5 tw:flex tw:items-center tw:gap-2">
        <div class="kb-card__progress tw:h-[3px] tw:flex-1 tw:overflow-hidden tw:rounded-full tw:bg-[var(--border-default,var(--border-subtle))]">
          <div class="kb-card__progress-fill tw:h-full tw:rounded-full tw:bg-[var(--accent,#3b82f6)] tw:transition-[width] tw:duration-200 tw:motion-reduce:transition-none" :style="{ width: taskProgress.pct + '%' }" />
        </div>
        <span class="kb-card__progress-text tw:inline-flex tw:shrink-0 tw:items-center tw:gap-1.5 tw:text-[10px] tw:leading-none tw:font-medium tw:text-[var(--text-muted,var(--text-secondary))]">
          <span>{{ taskProgress.pct }}%</span>
          <span class="kb-card__progress-count tw:text-content-muted">{{ taskProgress.done }}/{{ taskProgress.total }}</span>
        </span>
      </div>
    </div>
  </div>
</template>
