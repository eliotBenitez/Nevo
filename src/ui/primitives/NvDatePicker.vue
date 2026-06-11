<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { ChevronLeft, ChevronRight, X, Calendar } from 'lucide-vue-next'

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
const todayIso = today.toISOString().slice(0, 10)

const viewDate = ref(new Date(today.getFullYear(), today.getMonth(), 1))

const displayLabel = computed(() => {
  if (!props.modelValue) return null
  const d = new Date(props.modelValue)
  if (isNaN(d.getTime())) return null
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
      const iso = cur.toISOString().slice(0, 10)
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
    const d = new Date(props.modelValue)
    if (!isNaN(d.getTime())) viewDate.value = new Date(d.getFullYear(), d.getMonth(), 1)
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
  <div class="ndp-root">
    <button
      ref="triggerRef"
      type="button"
      class="ndp-trigger"
      :class="{ 'ndp-trigger--open': isOpen, 'ndp-trigger--disabled': disabled, 'ndp-trigger--filled': !!modelValue }"
      :disabled="disabled"
      @click="isOpen ? close() : open()"
    >
      <Calendar :size="12" class="ndp-trigger__icon" />
      <span class="ndp-trigger__label">{{ displayLabel ?? placeholder }}</span>
      <button v-if="modelValue" type="button" class="ndp-clear" @click="clear">
        <X :size="10" />
      </button>
    </button>

    <Teleport to="body">
      <div
        v-if="isOpen"
        ref="popoverRef"
        class="ndp-popover"
        :style="{ top: popoverPos.top + 'px', left: popoverPos.left + 'px' }"
      >
        <!-- Month nav -->
        <div class="ndp-nav">
          <button type="button" class="ndp-nav__btn" @click="prevMonth">
            <ChevronLeft :size="12" />
          </button>
          <span class="ndp-nav__title">{{ monthTitle }}</span>
          <button type="button" class="ndp-nav__btn" @click="nextMonth">
            <ChevronRight :size="12" />
          </button>
        </div>

        <!-- Day-of-week headers -->
        <div class="ndp-dow">
          <span v-for="d in DOW" :key="d" class="ndp-dow__cell">{{ d }}</span>
        </div>

        <!-- Grid -->
        <div class="ndp-grid">
          <template v-for="(week, wi) in calGrid" :key="wi">
            <button
              v-for="day in week"
              :key="day.iso"
              type="button"
              class="ndp-day"
              :class="{
                'ndp-day--muted': !day.inMonth,
                'ndp-day--today': day.isToday,
                'ndp-day--selected': day.isSelected,
              }"
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
.ndp-root { display: inline-flex; }

.ndp-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border-radius: calc(6px * var(--radius-scale, 1));
  border: 1px solid var(--line-2, var(--border-subtle));
  background: var(--glass-3, var(--surface-1));
  color: var(--text-3, var(--text-secondary));
  font-size: 12px;
  cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
  min-width: 120px;
}

.ndp-trigger:hover:not(.ndp-trigger--disabled) {
  border-color: var(--line-strong, var(--border-muted));
}

.ndp-trigger--open { border-color: var(--accent); }

.ndp-trigger--filled { color: var(--text-1, var(--text-primary)); }

.ndp-trigger--disabled { opacity: 0.5; cursor: not-allowed; }

.ndp-trigger__icon { flex-shrink: 0; color: var(--text-4, var(--text-muted)); }

.ndp-trigger__label { flex: 1; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.ndp-clear {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  background: var(--hover-strong, var(--surface-2));
  color: var(--text-4, var(--text-muted));
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: background 0.1s, color 0.1s;
}
.ndp-clear:hover { background: var(--accent); color: white; }

/* Popover */
.ndp-popover {
  position: fixed;
  z-index: 300;
  width: 240px;
  background: var(--glass-3, var(--surface-1));
  border: 1px solid var(--line-2, var(--border-subtle));
  border-radius: calc(10px * var(--radius-scale, 1));
  box-shadow: 0 16px 48px -8px oklch(0 0 0 / 0.35);
  padding: 10px;
  animation: ndp-in 0.12s ease;
}

@keyframes ndp-in {
  from { opacity: 0; transform: scale(0.96) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Nav */
.ndp-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 8px;
}

.ndp-nav__btn {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: calc(5px * var(--radius-scale, 1));
  border: none;
  background: none;
  color: var(--text-3, var(--text-secondary));
  cursor: pointer;
  transition: background 0.1s;
}
.ndp-nav__btn:hover { background: var(--hover-strong, var(--surface-2)); }

.ndp-nav__title {
  flex: 1;
  text-align: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-1, var(--text-primary));
}

/* Day-of-week */
.ndp-dow {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;
}

.ndp-dow__cell {
  text-align: center;
  font-size: 10px;
  font-weight: 600;
  color: var(--text-4, var(--text-muted));
  padding: 2px 0;
}

/* Grid */
.ndp-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.ndp-day {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  border-radius: calc(6px * var(--radius-scale, 1));
  border: none;
  background: none;
  font-size: 11.5px;
  color: var(--text-1, var(--text-primary));
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.ndp-day:hover { background: var(--hover-strong, var(--surface-2)); }

.ndp-day--muted { color: var(--text-4, var(--text-muted)); }

.ndp-day--today {
  font-weight: 700;
  color: var(--accent);
}

.ndp-day--selected {
  background: var(--accent);
  color: white;
  font-weight: 600;
}

.ndp-day--selected:hover { background: var(--accent); opacity: 0.9; }
</style>
