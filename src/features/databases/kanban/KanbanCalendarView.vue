<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import type { KanbanBoard, KanbanCard } from '../../../types/kanban'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import { findCardField, getBoardStatusProperty, getCardFieldDescriptors, getCardStatusValue } from './kanbanFields'

interface Props {
  board: KanbanBoard
  cards: KanbanCard[]
  searchQuery?: string
}

const props = defineProps<Props>()
const emit = defineEmits<{ 'open-card': [cardId: string] }>()
const { t, locale } = useI18n()

type CalMode = 'month' | 'week' | 'day'

const calMode = ref<CalMode>('month')
const today = new Date()
const todayIso = today.toISOString().slice(0, 10)
const viewDate = ref(new Date(today.getFullYear(), today.getMonth(), today.getDate()))
const dragOverDay = ref<string | null>(null)
const draggingCardId = ref<string | null>(null)
const selectedDateFieldId = ref('')

const statusProp = computed(() => getBoardStatusProperty(props.board))
const dateFields = computed(() => getCardFieldDescriptors(props.cards, ['date']))
const dateFieldOptions = computed(() => dateFields.value.map(field => ({ value: field.id, label: field.name })))
const activeDateField = computed(() => dateFields.value.find(field => field.id === selectedDateFieldId.value) ?? null)

watch(dateFields, fields => {
  if (!fields.some(field => field.id === selectedDateFieldId.value)) {
    selectedDateFieldId.value = ''
  }
}, { immediate: true })

function navPrev() {
  const date = viewDate.value
  if (calMode.value === 'month') viewDate.value = new Date(date.getFullYear(), date.getMonth() - 1, date.getDate())
  else if (calMode.value === 'week') viewDate.value = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7)
  else viewDate.value = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1)
}

function navNext() {
  const date = viewDate.value
  if (calMode.value === 'month') viewDate.value = new Date(date.getFullYear(), date.getMonth() + 1, date.getDate())
  else if (calMode.value === 'week') viewDate.value = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7)
  else viewDate.value = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
}

function goToday() {
  viewDate.value = new Date(today.getFullYear(), today.getMonth(), today.getDate())
}

const navTitle = computed(() => {
  const date = viewDate.value
  if (calMode.value === 'week') {
    const weekDay = date.getDay() === 0 ? 6 : date.getDay() - 1
    const monday = new Date(date)
    monday.setDate(date.getDate() - weekDay)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return `${monday.toLocaleDateString(locale.value, { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString(locale.value, { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  if (calMode.value === 'day') {
    return date.toLocaleDateString(locale.value, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }
  return date.toLocaleDateString(locale.value, { month: 'long', year: 'numeric' })
})

const weekDays = computed(() => {
  const date = viewDate.value
  const weekDay = date.getDay() === 0 ? 6 : date.getDay() - 1
  const monday = new Date(date)
  monday.setDate(date.getDate() - weekDay)

  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday)
    day.setDate(monday.getDate() + index)
    const iso = day.toISOString().slice(0, 10)
    return {
      iso,
      isToday: iso === todayIso,
      label: day.toLocaleDateString(locale.value, { weekday: 'short' }),
      num: day.getDate(),
    }
  })
})

const viewDayIso = computed(() => viewDate.value.toISOString().slice(0, 10))

const calGrid = computed(() => {
  const year = viewDate.value.getFullYear()
  const month = viewDate.value.getMonth()
  const first = new Date(year, month, 1)
  let startDay = first.getDay()
  if (startDay === 0) startDay = 7
  const start = new Date(first)
  start.setDate(start.getDate() - (startDay - 1))

  const weeks: { date: Date; iso: string; inMonth: boolean; isToday: boolean }[][] = []
  const cursor = new Date(start)
  for (let weekIndex = 0; weekIndex < 6; weekIndex++) {
    const week: { date: Date; iso: string; inMonth: boolean; isToday: boolean }[] = []
    for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
      const iso = cursor.toISOString().slice(0, 10)
      week.push({
        date: new Date(cursor),
        iso,
        inMonth: cursor.getMonth() === month,
        isToday: iso === todayIso,
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
    if (weekIndex >= 4 && week.every(day => !day.inMonth)) break
  }
  return weeks
})

const eventsByDate = computed(() => {
  if (!activeDateField.value) return new Map<string, KanbanCard[]>()
  const map = new Map<string, KanbanCard[]>()
  for (const card of props.cards) {
    const field = findCardField(card, activeDateField.value)
    if (!field || typeof field.value !== 'string' || !field.value) continue
    const iso = field.value.slice(0, 10)
    if (!map.has(iso)) map.set(iso, [])
    map.get(iso)?.push(card)
  }
  return map
})

function getStatusColor(card: KanbanCard) {
  const value = getCardStatusValue(card, props.board)
  const option = statusProp.value?.options?.find(item => item.id === value)
  if (!option?.color) return null
  return {
    dot: option.color,
    soft: `${option.color}28`,
    text: option.color,
  }
}

function isOverdue(card: KanbanCard) {
  if (!activeDateField.value) return false
  const field = findCardField(card, activeDateField.value)
  return typeof field?.value === 'string' ? new Date(field.value) < today : false
}

function onDragStart(cardId: string) {
  draggingCardId.value = cardId
}

function onDayDragOver(event: DragEvent, iso: string) {
  event.preventDefault()
  dragOverDay.value = iso
}

function onDayDrop(_iso: string) {
  dragOverDay.value = null
  draggingCardId.value = null
}

function onDayDragLeave() {
  dragOverDay.value = null
}

const dowLabels = computed(() =>
  Array.from({ length: 7 }, (_, index) =>
    new Date(2024, 0, 1 + index).toLocaleDateString(locale.value, { weekday: 'short' }),
  ),
)

// Month-view day cell background: `--drop` beats `--muted` beats idle,
// matching the original source order (both are plain 0,1,0 classes, so a
// flat ternary reproduces it exactly). Outline only comes from `--drop`
// here, so it can live in the same branch without conflicting with anything.
function monthDayClass(day: { inMonth: boolean; iso: string }) {
  if (dragOverDay.value === day.iso) {
    return 'kb-cal__day--drop tw:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)] tw:outline tw:outline-[1.5px] tw:outline-dashed tw:outline-accent tw:-outline-offset-2'
  }
  if (!day.inMonth) return 'kb-cal__day--muted tw:bg-transparent'
  return 'tw:bg-surface-raised'
}

// Today badge on the day-of-month number (shared shape between the month
// grid and the week view's column header number).
function todayNumClass(isToday: boolean) {
  return isToday
    ? 'kb-cal__day-num--today tw:inline-grid tw:size-5 tw:place-items-center tw:rounded-full tw:bg-accent tw:font-semibold tw:text-white'
    : 'tw:text-content-secondary'
}

// Week-view column background and outline are two independent properties:
// `--today` (background only) comes after `--drop` (background + outline)
// in the original source, so `--today` wins the background tie-break when
// both apply, but `--drop`'s outline is untouched by `--today` and must
// still show regardless.
function weekColClass(day: { isToday: boolean; iso: string }) {
  const isDrop = dragOverDay.value === day.iso
  const bg = day.isToday
    ? 'kb-cal__week-view__col--today tw:bg-[var(--accent-soft,rgb(161_98_7/0.08))]'
    : isDrop
      ? 'tw:bg-[color-mix(in_oklab,var(--accent)_10%,transparent)]'
      : 'tw:bg-surface-raised'
  const outline = isDrop ? 'kb-cal__day--drop tw:outline tw:outline-[1.5px] tw:outline-dashed tw:outline-accent tw:-outline-offset-2' : ''
  return `${bg} ${outline}`.trim()
}
</script>

<template>
  <div class="kb-cal tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:overflow-hidden">
    <div class="kb-cal__nav tw:flex tw:shrink-0 tw:flex-wrap tw:items-center tw:gap-2 tw:px-5 tw:py-[9px]">
      <button type="button" class="kb-cal__nav-btn tw:grid tw:size-[26px] tw:place-items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:text-[var(--text-muted,var(--text-secondary))] tw:cursor-pointer" @click="navPrev">
        <ChevronLeft :size="12" />
      </button>
      <button type="button" class="kb-cal__nav-btn tw:grid tw:size-[26px] tw:place-items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:text-[var(--text-muted,var(--text-secondary))] tw:cursor-pointer" @click="navNext">
        <ChevronRight :size="12" />
      </button>
      <span class="kb-cal__month-title tw:[font-family:var(--font-serif,Georgia,serif)] tw:text-[17px] tw:font-normal tw:text-content-primary tw:italic">{{ navTitle }}</span>
      <button type="button" class="kb-cal__today-btn tw:h-7 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-2.5 tw:text-[var(--text-muted,var(--text-secondary))] tw:cursor-pointer" @click="goToday">{{ t('kanban.calendar.today') }}</button>
      <div class="kb-cal__spacer tw:flex-1 tw:max-[820px]:hidden" />
      <div class="kb-cal__field-picker tw:flex tw:items-center tw:gap-2 tw:max-[820px]:w-full">
        <span class="kb-cal__field-label tw:text-[11px] tw:tracking-[0.04em] tw:text-content-muted tw:uppercase">{{ t('kanban.calendar.chooseField') }}</span>
        <NvSelect
          :model-value="selectedDateFieldId"
          :options="dateFieldOptions"
          :min-width="180"
          :placeholder="t('kanban.calendar.chooseField')"
          @update:model-value="value => selectedDateFieldId = value as string"
        />
      </div>
      <div class="kb-cal__mode-switch tw:flex tw:gap-px tw:rounded-[calc(6px*var(--radius-scale,1))] tw:bg-[var(--hover-strong,var(--surface-overlay))] tw:p-0.5">
        <span
          v-for="mode in (['month', 'week', 'day'] as CalMode[])"
          :key="mode"
          class="kb-cal__mode-btn tw:rounded-[calc(4px*var(--radius-scale,1))] tw:px-2.5 tw:py-[3px] tw:text-[11px] tw:cursor-pointer"
          :class="calMode === mode
            ? 'kb-cal__mode-btn--active tw:bg-surface-raised tw:font-[550] tw:text-content-primary tw:shadow-(--shadow-raised)'
            : 'tw:text-[var(--text-muted,var(--text-secondary))]'"
          @click="calMode = mode"
        >
          {{ t(`kanban.calendar.${mode}`) }}
        </span>
      </div>
    </div>

    <div v-if="!activeDateField" class="kb-cal__empty tw:flex tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:text-[var(--text-muted,var(--text-secondary))]">
      <p>{{ t('kanban.calendar.noDateProp') }}</p>
      <p class="kb-cal__empty-sub tw:max-w-[280px] tw:text-center tw:text-xs tw:text-content-muted">{{ t('kanban.calendar.noDateHint') }}</p>
      <button
        v-if="dateFields.length > 0"
        type="button"
        class="kb-cal__select-btn tw:h-7 tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-transparent tw:px-2.5 tw:text-[var(--text-muted,var(--text-secondary))] tw:cursor-pointer"
        @click="selectedDateFieldId = dateFields[0].id"
      >
        {{ t('kanban.calendar.pickFirstField') }}
      </button>
    </div>

    <div v-else-if="calMode === 'month'" class="kb-cal__grid-wrap tw:flex tw:flex-1 tw:flex-col tw:overflow-hidden tw:px-4 tw:pt-2.5 tw:pb-3.5">
      <div class="kb-cal__dow-row tw:grid tw:grid-cols-7">
        <div v-for="label in dowLabels" :key="label" class="kb-cal__dow tw:px-2 tw:py-1.5 tw:text-[10.5px] tw:font-semibold tw:tracking-[0.04em] tw:text-content-muted tw:uppercase">{{ label }}</div>
      </div>
      <div class="kb-cal__weeks tw:flex tw:flex-1 tw:flex-col tw:gap-px tw:overflow-hidden tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-[var(--border-default,var(--border-subtle))] tw:bg-[var(--border-default,var(--border-subtle))]">
        <div v-for="(week, index) in calGrid" :key="index" class="kb-cal__week tw:grid tw:flex-1 tw:grid-cols-7 tw:gap-px">
          <div
            v-for="day in week"
            :key="day.iso"
            class="kb-cal__day tw:relative tw:flex tw:min-h-20 tw:flex-col tw:gap-[3px] tw:px-[7px] tw:py-1.5"
            :class="monthDayClass(day)"
            @dragover="onDayDragOver($event, day.iso)"
            @drop="onDayDrop(day.iso)"
            @dragleave.self="onDayDragLeave"
          >
            <div class="kb-cal__day-num-wrap tw:flex tw:justify-end">
              <span class="kb-cal__day-num tw:text-[11px]" :class="todayNumClass(day.isToday)">{{ day.date.getDate() }}</span>
            </div>
            <div class="kb-cal__events tw:flex tw:flex-col tw:gap-0.5">
              <div
                v-for="card in (eventsByDate.get(day.iso) ?? [])"
                :key="card.id"
                class="kb-cal__event tw:flex tw:items-center tw:gap-1 tw:rounded-[calc(4px*var(--radius-scale,1))] tw:border-l-2 tw:border-l-[var(--text-muted,var(--text-muted))] tw:bg-[var(--hover-strong,var(--surface-overlay))] tw:px-1.5 tw:py-1 tw:text-[10.5px] tw:text-content-secondary tw:cursor-pointer"
                :class="{ 'kb-cal__event--overdue': isOverdue(card) }"
                :style="getStatusColor(card) ? { background: getStatusColor(card)?.soft, color: getStatusColor(card)?.text, borderLeftColor: getStatusColor(card)?.dot } : {}"
                draggable="true"
                @dragstart="onDragStart(card.id)"
                @click.stop="emit('open-card', card.id)"
              >
                <span v-if="isOverdue(card)" class="kb-cal__event-warn">⚠</span>
                {{ card.title }}
              </div>
            </div>
            <div v-if="dragOverDay === day.iso" class="kb-cal__drop-hint tw:text-[10px] tw:text-content-muted">{{ t('kanban.calendar.dropReschedule') }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="calMode === 'week'" class="kb-cal__week-view tw:flex tw:flex-1 tw:flex-col tw:overflow-hidden tw:px-4 tw:pt-2.5 tw:pb-3.5">
      <div class="kb-cal__week-view__header tw:grid tw:grid-cols-7 tw:gap-px tw:overflow-hidden tw:rounded-[calc(10px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-[var(--border-default,var(--border-subtle))] tw:bg-[var(--border-default,var(--border-subtle))]">
        <div
          v-for="day in weekDays"
          :key="day.iso"
          class="kb-cal__week-view__col-head tw:flex tw:flex-col tw:items-center tw:px-1 tw:py-1.5"
          :class="day.isToday ? 'kb-cal__week-view__col-head--today tw:bg-[var(--accent-soft,rgb(161_98_7/0.08))]' : 'tw:bg-surface-raised'"
        >
          <span class="kb-cal__week-view__dow">{{ day.label }}</span>
          <span class="kb-cal__week-view__num" :class="todayNumClass(day.isToday)">{{ day.num }}</span>
        </div>
      </div>
      <div class="kb-cal__week-view__body tw:flex-1 tw:grid tw:grid-cols-7 tw:gap-px tw:overflow-hidden tw:rounded-b-[calc(10px*var(--radius-scale,1))] tw:border-x tw:border-b tw:border-solid tw:border-[var(--border-default,var(--border-subtle))] tw:bg-[var(--border-default,var(--border-subtle))]">
        <div
          v-for="day in weekDays"
          :key="day.iso"
          class="kb-cal__week-view__col tw:relative tw:flex tw:min-h-20 tw:flex-col tw:gap-[3px] tw:px-[7px] tw:py-1.5"
          :class="weekColClass(day)"
          @dragover="onDayDragOver($event, day.iso)"
          @drop="onDayDrop(day.iso)"
          @dragleave.self="onDayDragLeave"
        >
          <div
            v-for="card in (eventsByDate.get(day.iso) ?? [])"
            :key="card.id"
            class="kb-cal__event tw:flex tw:items-center tw:gap-1 tw:rounded-[calc(4px*var(--radius-scale,1))] tw:border-l-2 tw:border-l-[var(--text-muted,var(--text-muted))] tw:bg-[var(--hover-strong,var(--surface-overlay))] tw:px-1.5 tw:py-1 tw:text-[10.5px] tw:text-content-secondary tw:cursor-pointer"
            :class="{ 'kb-cal__event--overdue': isOverdue(card) }"
            :style="getStatusColor(card) ? { background: getStatusColor(card)?.soft, color: getStatusColor(card)?.text, borderLeftColor: getStatusColor(card)?.dot } : {}"
            draggable="true"
            @dragstart="onDragStart(card.id)"
            @click.stop="emit('open-card', card.id)"
          >
            <span v-if="isOverdue(card)" class="kb-cal__event-warn">⚠</span>
            {{ card.title }}
          </div>
          <div v-if="!(eventsByDate.get(day.iso) ?? []).length" class="kb-cal__week-view__empty tw:text-[10px] tw:text-content-muted">{{ t('kanban.calendar.noEvents') }}</div>
        </div>
      </div>
    </div>

    <div v-else class="kb-cal__day-view tw:flex tw:flex-1 tw:p-5">
      <div class="kb-cal__day-view__events tw:flex tw:w-full tw:flex-1 tw:flex-col tw:items-center tw:justify-center tw:gap-2 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle tw:p-4 tw:text-[var(--text-muted,var(--text-secondary))]">
        <div
          v-for="card in (eventsByDate.get(viewDayIso) ?? [])"
          :key="card.id"
          class="kb-cal__day-view__event tw:flex tw:items-center tw:gap-1 tw:rounded-[calc(4px*var(--radius-scale,1))] tw:border-l-2 tw:border-l-[var(--text-muted,var(--text-muted))] tw:bg-surface-raised tw:px-1.5 tw:py-1 tw:text-[10.5px] tw:text-content-secondary tw:cursor-pointer"
          :class="{ 'kb-cal__event--overdue': isOverdue(card) }"
          :style="getStatusColor(card) ? { borderLeftColor: getStatusColor(card)?.dot } : {}"
          @click="emit('open-card', card.id)"
        >
          <span v-if="isOverdue(card)" class="kb-cal__event-warn">⚠</span>
          {{ card.title }}
        </div>
        <div v-if="!(eventsByDate.get(viewDayIso) ?? []).length" class="kb-cal__day-view__empty tw:text-[10px] tw:text-content-muted">{{ t('kanban.calendar.noEvents') }}</div>
      </div>
    </div>
  </div>
</template>
