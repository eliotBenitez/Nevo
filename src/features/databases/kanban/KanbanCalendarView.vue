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
</script>

<template>
  <div class="kb-cal">
    <div class="kb-cal__nav">
      <button type="button" class="kb-cal__nav-btn" @click="navPrev">
        <ChevronLeft :size="12" />
      </button>
      <button type="button" class="kb-cal__nav-btn" @click="navNext">
        <ChevronRight :size="12" />
      </button>
      <span class="kb-cal__month-title">{{ navTitle }}</span>
      <button type="button" class="kb-cal__today-btn" @click="goToday">{{ t('kanban.calendar.today') }}</button>
      <div class="kb-cal__spacer" />
      <div class="kb-cal__field-picker">
        <span class="kb-cal__field-label">{{ t('kanban.calendar.chooseField') }}</span>
        <NvSelect
          :model-value="selectedDateFieldId"
          :options="dateFieldOptions"
          :min-width="180"
          :placeholder="t('kanban.calendar.chooseField')"
          @update:model-value="value => selectedDateFieldId = value as string"
        />
      </div>
      <div class="kb-cal__mode-switch">
        <span
          v-for="mode in (['month', 'week', 'day'] as CalMode[])"
          :key="mode"
          class="kb-cal__mode-btn"
          :class="{ 'kb-cal__mode-btn--active': calMode === mode }"
          @click="calMode = mode"
        >
          {{ t(`kanban.calendar.${mode}`) }}
        </span>
      </div>
    </div>

    <div v-if="!activeDateField" class="kb-cal__empty">
      <p>{{ t('kanban.calendar.noDateProp') }}</p>
      <p class="kb-cal__empty-sub">{{ t('kanban.calendar.noDateHint') }}</p>
      <button
        v-if="dateFields.length > 0"
        type="button"
        class="kb-cal__select-btn"
        @click="selectedDateFieldId = dateFields[0].id"
      >
        {{ t('kanban.calendar.pickFirstField') }}
      </button>
    </div>

    <div v-else-if="calMode === 'month'" class="kb-cal__grid-wrap">
      <div class="kb-cal__dow-row">
        <div v-for="label in dowLabels" :key="label" class="kb-cal__dow">{{ label }}</div>
      </div>
      <div class="kb-cal__weeks">
        <div v-for="(week, index) in calGrid" :key="index" class="kb-cal__week">
          <div
            v-for="day in week"
            :key="day.iso"
            class="kb-cal__day"
            :class="{
              'kb-cal__day--muted': !day.inMonth,
              'kb-cal__day--today': day.isToday,
              'kb-cal__day--drop': dragOverDay === day.iso,
            }"
            @dragover="onDayDragOver($event, day.iso)"
            @drop="onDayDrop(day.iso)"
            @dragleave.self="onDayDragLeave"
          >
            <div class="kb-cal__day-num-wrap">
              <span class="kb-cal__day-num" :class="{ 'kb-cal__day-num--today': day.isToday }">{{ day.date.getDate() }}</span>
            </div>
            <div class="kb-cal__events">
              <div
                v-for="card in (eventsByDate.get(day.iso) ?? [])"
                :key="card.id"
                class="kb-cal__event"
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
            <div v-if="dragOverDay === day.iso" class="kb-cal__drop-hint">{{ t('kanban.calendar.dropReschedule') }}</div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="calMode === 'week'" class="kb-cal__week-view">
      <div class="kb-cal__week-view__header">
        <div
          v-for="day in weekDays"
          :key="day.iso"
          class="kb-cal__week-view__col-head"
          :class="{ 'kb-cal__week-view__col-head--today': day.isToday }"
        >
          <span class="kb-cal__week-view__dow">{{ day.label }}</span>
          <span class="kb-cal__week-view__num" :class="{ 'kb-cal__day-num--today': day.isToday }">{{ day.num }}</span>
        </div>
      </div>
      <div class="kb-cal__week-view__body">
        <div
          v-for="day in weekDays"
          :key="day.iso"
          class="kb-cal__week-view__col"
          :class="{ 'kb-cal__week-view__col--today': day.isToday, 'kb-cal__day--drop': dragOverDay === day.iso }"
          @dragover="onDayDragOver($event, day.iso)"
          @drop="onDayDrop(day.iso)"
          @dragleave.self="onDayDragLeave"
        >
          <div
            v-for="card in (eventsByDate.get(day.iso) ?? [])"
            :key="card.id"
            class="kb-cal__event"
            :class="{ 'kb-cal__event--overdue': isOverdue(card) }"
            :style="getStatusColor(card) ? { background: getStatusColor(card)?.soft, color: getStatusColor(card)?.text, borderLeftColor: getStatusColor(card)?.dot } : {}"
            draggable="true"
            @dragstart="onDragStart(card.id)"
            @click.stop="emit('open-card', card.id)"
          >
            <span v-if="isOverdue(card)" class="kb-cal__event-warn">⚠</span>
            {{ card.title }}
          </div>
          <div v-if="!(eventsByDate.get(day.iso) ?? []).length" class="kb-cal__week-view__empty">{{ t('kanban.calendar.noEvents') }}</div>
        </div>
      </div>
    </div>

    <div v-else class="kb-cal__day-view">
      <div class="kb-cal__day-view__events">
        <div
          v-for="card in (eventsByDate.get(viewDayIso) ?? [])"
          :key="card.id"
          class="kb-cal__day-view__event"
          :class="{ 'kb-cal__event--overdue': isOverdue(card) }"
          :style="getStatusColor(card) ? { borderLeftColor: getStatusColor(card)?.dot } : {}"
          @click="emit('open-card', card.id)"
        >
          <span v-if="isOverdue(card)" class="kb-cal__event-warn">⚠</span>
          {{ card.title }}
        </div>
        <div v-if="!(eventsByDate.get(viewDayIso) ?? []).length" class="kb-cal__day-view__empty">{{ t('kanban.calendar.noEvents') }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.kb-cal {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.kb-cal__nav {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 20px;
  border-bottom: 1px solid var(--line-1, var(--border-subtle));
  flex-shrink: 0;
  flex-wrap: wrap;
}

.kb-cal__nav-btn,
.kb-cal__today-btn,
.kb-cal__select-btn {
  border-radius: calc(6px * var(--radius-scale, 1));
  border: 1px solid var(--line-1, var(--border-subtle));
  background: none;
  color: var(--text-3, var(--text-secondary));
  cursor: pointer;
}

.kb-cal__nav-btn {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
}

.kb-cal__today-btn,
.kb-cal__select-btn {
  height: 28px;
  padding: 0 10px;
}

.kb-cal__month-title {
  font-size: 17px;
  font-weight: 400;
  font-style: italic;
  font-family: var(--font-serif, Georgia, serif);
  color: var(--text-1, var(--text-primary));
}

.kb-cal__spacer {
  flex: 1;
}

.kb-cal__field-picker {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-cal__field-label {
  font-size: 11px;
  color: var(--text-4, var(--text-muted));
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.kb-cal__mode-switch {
  display: flex;
  padding: 2px;
  background: var(--hover-strong, var(--surface-2));
  border-radius: calc(6px * var(--radius-scale, 1));
  gap: 1px;
}

.kb-cal__mode-btn {
  padding: 3px 9px;
  border-radius: calc(4px * var(--radius-scale, 1));
  font-size: 11px;
  color: var(--text-3, var(--text-secondary));
  cursor: pointer;
}

.kb-cal__mode-btn--active {
  background: var(--glass-3, var(--surface-1));
  color: var(--text-1, var(--text-primary));
  font-weight: 550;
}

.kb-cal__empty,
.kb-cal__day-view,
.kb-cal__day-view__events {
  flex: 1;
  display: flex;
}

.kb-cal__empty,
.kb-cal__day-view__events {
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-3, var(--text-secondary));
}

.kb-cal__empty-sub {
  font-size: 12px;
  color: var(--text-4, var(--text-muted));
  max-width: 280px;
  text-align: center;
}

.kb-cal__grid-wrap,
.kb-cal__week-view {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 10px 16px 14px;
}

.kb-cal__dow-row,
.kb-cal__week,
.kb-cal__week-view__header,
.kb-cal__week-view__body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.kb-cal__dow {
  padding: 5px 8px;
  font-size: 10.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-4, var(--text-muted));
}

.kb-cal__weeks,
.kb-cal__week-view__header,
.kb-cal__week-view__body {
  border: 1px solid var(--line-2, var(--border-subtle));
  border-radius: calc(10px * var(--radius-scale, 1));
  overflow: hidden;
  background: var(--line-2, var(--border-subtle));
  gap: 1px;
}

.kb-cal__weeks {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.kb-cal__week {
  flex: 1;
  gap: 1px;
}

.kb-cal__day,
.kb-cal__week-view__col-head,
.kb-cal__week-view__col,
.kb-cal__day-view__event {
  background: var(--glass-2, var(--surface-1));
}

.kb-cal__day,
.kb-cal__week-view__col {
  padding: 6px 7px;
  display: flex;
  flex-direction: column;
  gap: 3px;
  position: relative;
  min-height: 80px;
}

.kb-cal__day--muted {
  background: transparent;
}

.kb-cal__day--drop {
  background: color-mix(in oklab, var(--accent) 10%, transparent);
  outline: 1.5px dashed var(--accent);
  outline-offset: -2px;
}

.kb-cal__day-num-wrap {
  display: flex;
  justify-content: flex-end;
}

.kb-cal__day-num {
  font-size: 11px;
  color: var(--text-2, var(--text-secondary));
}

.kb-cal__day-num--today {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  font-weight: 600;
  display: inline-grid;
  place-items: center;
}

.kb-cal__events {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.kb-cal__event,
.kb-cal__day-view__event {
  font-size: 10.5px;
  padding: 4px 6px;
  border-radius: calc(4px * var(--radius-scale, 1));
  background: var(--hover-strong, var(--surface-2));
  color: var(--text-2, var(--text-secondary));
  border-left: 2px solid var(--text-3, var(--text-muted));
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}

.kb-cal__drop-hint,
.kb-cal__week-view__empty,
.kb-cal__day-view__empty {
  font-size: 10px;
  color: var(--text-4, var(--text-muted));
}

.kb-cal__week-view__col-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 4px;
}

.kb-cal__week-view__col-head--today,
.kb-cal__week-view__col--today {
  background: var(--accent-soft, rgb(161 98 7 / 0.08));
}

.kb-cal__week-view__body {
  flex: 1;
  border-top: none;
  border-radius: 0 0 10px 10px;
}

.kb-cal__day-view {
  padding: 20px;
}

.kb-cal__day-view__events {
  width: 100%;
  border-radius: calc(12px * var(--radius-scale, 1));
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--glass-2, var(--surface-1));
  padding: 16px;
}

@media (max-width: 820px) {
  .kb-cal__field-picker {
    width: 100%;
  }

  .kb-cal__spacer {
    display: none;
  }
}
</style>
