<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { ChevronLeft, ChevronRight, X, Calendar } from 'lucide-vue-next'
import { formatDateOnly, parseDateOnly } from '../../utils/dateOnly'

interface Props {
  modelValue: string | null
  placeholder?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Pick a date',
  disabled: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()

const isOpen = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const popoverRef = ref<HTMLDivElement | null>(null)
const popoverPos = ref({ top: 0, left: 0 })

const today = new Date()
const todayIso = formatDateOnly(today)

const viewDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))

const displayLabel = computed(() => {
  if (!props.modelValue) return null
  const d = parseDateOnly(props.modelValue)
  if (!d) return null
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
})

const monthTitle = computed(() =>
  viewDate.value.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
)

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const calGrid = computed(() => {
  const year = viewDate.value.getFullYear()
  const month = viewDate.value.getMonth()
  const first = new Date(year, month, 1)
  let startDay = first.getDay()
  if (startDay === 0) startDay = 7
  const start = new Date(first)
  start.setDate(start.getDate() - (startDay - 1))

  const weeks: { date: Date; iso: string; inMonth: boolean; isToday: boolean; isSelected: boolean }[][] = []
  const cur = new Date(start)
  for (let w = 0; w < 6; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const iso = formatDateOnly(cur)
      week.push({
        date: new Date(cur),
        iso,
        inMonth: cur.getMonth() === month,
        isToday: iso === todayIso,
        isSelected: iso === props.modelValue,
      })
      cur.setDate(cur.getDate() + 1)
    }
    weeks.push(week)
    if (w >= 4 && week.every(d => !d.inMonth)) break
  }
  return weeks
})

function prevMonth() {
  const d = viewDate.value
  viewDate.value = new Date(d.getFullYear(), d.getMonth() - 1, 1)
}

function nextMonth() {
  const d = viewDate.value
  viewDate.value = new Date(d.getFullYear(), d.getMonth() + 1, 1)
}

function selectDay(iso: string) {
  emit('update:modelValue', iso)
  close()
}

function clear(e: MouseEvent) {
  e.stopPropagation()
  emit('update:modelValue', null)
}

async function open() {
  if (props.disabled || isOpen.value) return
  if (props.modelValue) {
    const d = parseDateOnly(props.modelValue)
    if (d) viewDate.value = new Date(d.getFullYear(), d.getMonth(), 1)
  }
  isOpen.value = true
  await nextTick()
  positionPopover()
  document.addEventListener('pointerdown', onDocPointerDown, true)
}

function close() {
  isOpen.value = false
  document.removeEventListener('pointerdown', onDocPointerDown, true)
}

function positionPopover() {
  const trigger = triggerRef.value
  const popover = popoverRef.value
  if (!trigger || !popover) return
  const rect = trigger.getBoundingClientRect()
  const pw = popover.offsetWidth || 240
  const ph = popover.offsetHeight || 280
  let left = rect.left
  let top = rect.bottom + 6
  if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12
  if (top + ph > window.innerHeight - 12) top = rect.top - ph - 6
  popoverPos.value = { top, left }
}

function onDocPointerDown(e: PointerEvent) {
  const t = e.target as Node
  if (triggerRef.value?.contains(t) || popoverRef.value?.contains(t)) return
  close()
}

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true)
})
</script>

<template>
  <div class="ndp-root tw:inline-flex">
    <button
      ref="triggerRef"
      type="button"
      class="ndp-trigger tw:inline-flex tw:h-8 tw:min-w-[120px] tw:cursor-pointer tw:items-center tw:gap-1.5 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:px-2.5 tw:text-xs tw:transition-[background-color,box-shadow] tw:duration-100 tw:enabled:hover:bg-[color-mix(in_oklab,var(--input-bg)_88%,var(--text-primary)_6%)] tw:disabled:cursor-not-allowed tw:disabled:opacity-50"
      :class="[
        isOpen ? 'ndp-trigger--open tw:bg-(--surface-raised) tw:shadow-[0_0_0_2px_var(--input-ring)]' : 'tw:bg-(--input-bg)',
        disabled && 'ndp-trigger--disabled',
        modelValue ? 'ndp-trigger--filled tw:text-content-primary' : 'tw:text-content-muted',
      ]"
      :disabled="disabled"
      @click="isOpen ? close() : open()"
    >
      <Calendar :size="12" class="ndp-trigger__icon tw:shrink-0 tw:text-content-muted" />
      <span class="ndp-trigger__label tw:flex-1 tw:truncate tw:text-left">{{ displayLabel ?? placeholder }}</span>
      <button v-if="modelValue" type="button" class="ndp-clear tw:grid tw:size-3.5 tw:shrink-0 tw:cursor-pointer tw:place-items-center tw:rounded-full tw:border-0 tw:bg-(--hover-strong) tw:p-0 tw:text-content-muted tw:transition-colors tw:duration-100 tw:hover:bg-accent tw:hover:text-content-on-accent" @click="clear">
        <X :size="10" />
      </button>
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="popoverRef"
        class="ndp-popover tw:fixed tw:z-[300] tw:w-60 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-2.5 tw:shadow-(--menu-shadow)"
        :style="{ top: popoverPos.top + 'px', left: popoverPos.left + 'px' }"
      >
        <!-- Month nav -->
        <div class="ndp-nav tw:mb-2 tw:flex tw:items-center tw:gap-1">
          <button type="button" class="ndp-nav__btn tw:grid tw:size-[22px] tw:cursor-pointer tw:place-items-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong)" @click="prevMonth">
            <ChevronLeft :size="12" />
          </button>
          <span class="ndp-nav__title tw:flex-1 tw:text-center tw:text-xs tw:font-semibold tw:text-content-primary">{{ monthTitle }}</span>
          <button type="button" class="ndp-nav__btn tw:grid tw:size-[22px] tw:cursor-pointer tw:place-items-center tw:rounded-[calc(5px*var(--radius-scale,1))] tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong)" @click="nextMonth">
            <ChevronRight :size="12" />
          </button>
        </div>

        <!-- Day-of-week headers -->
        <div class="ndp-dow tw:mb-1 tw:grid tw:grid-cols-7">
          <span v-for="d in DOW" :key="d" class="ndp-dow__cell tw:py-0.5 tw:text-center tw:text-[10px] tw:font-semibold tw:text-content-muted">{{ d }}</span>
        </div>

        <!-- Grid -->
        <div class="ndp-grid tw:grid tw:grid-cols-7 tw:gap-0.5">
          <template v-for="(week, wi) in calGrid" :key="wi">
            <button
              v-for="day in week"
              :key="day.iso"
              type="button"
              class="ndp-day tw:grid tw:aspect-square tw:cursor-pointer tw:place-items-center tw:rounded-[calc(6px*var(--radius-scale,1))] tw:border-0 tw:text-[11.5px] tw:transition-colors tw:duration-100"
              :class="[
                !day.inMonth && 'ndp-day--muted',
                day.isToday && 'ndp-day--today',
                day.isSelected && 'ndp-day--selected',
                day.isToday && !day.isSelected && 'tw:font-bold',
                day.isSelected && 'tw:font-semibold',
                day.isSelected
                  ? 'tw:bg-accent tw:hover:bg-accent tw:hover:opacity-90'
                  : 'tw:bg-transparent tw:hover:bg-(--hover-strong)',
                day.isSelected ? 'tw:text-content-on-accent' : day.isToday ? 'tw:text-accent' : day.inMonth ? 'tw:text-content-primary' : 'tw:text-content-muted',
              ]"
              @click="selectDay(day.iso)"
            >
              {{ day.date.getDate() }}
            </button>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.ndp-popover {
  animation: ndp-in 0.12s ease;
}

@keyframes ndp-in {
  from { opacity: 0; transform: scale(0.96) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

</style>
