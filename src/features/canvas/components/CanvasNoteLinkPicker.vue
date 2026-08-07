<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Search, X } from 'lucide-vue-next'
import type { CanvasNoteOption } from '../composables/useCanvasP1Features'

const props = defineProps<{
  open: boolean
  notes: readonly CanvasNoteOption[]
  title: string
  searchLabel: string
  emptyLabel: string
  closeLabel: string
}>()

defineEmits<{
  close: []
  select: [note: CanvasNoteOption]
}>()

const query = ref('')
const input = ref<HTMLInputElement | null>(null)
const filtered = computed(() => {
  const value = query.value.trim().toLocaleLowerCase()
  if (!value) return props.notes
  return props.notes.filter(note => `${note.title} ${note.id}`.toLocaleLowerCase().includes(value))
})

watch(() => props.open, (open) => {
  if (!open) return
  query.value = ''
  void nextTick(() => input.value?.focus())
})
</script>

<template>
  <div
    v-if="open"
    class="canvas-note-picker"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    @keydown.esc="$emit('close')"
    @pointerdown.stop
  >
    <header>
      <strong>{{ title }}</strong>
      <button type="button" :aria-label="closeLabel" @click="$emit('close')"><X :size="17" /></button>
    </header>
    <label>
      <Search :size="15" />
      <input ref="input" v-model="query" type="search" :placeholder="searchLabel" @keydown.esc="$emit('close')">
    </label>
    <div class="canvas-note-picker__list" role="listbox">
      <button
        v-for="note in filtered"
        :key="note.id"
        type="button"
        role="option"
        @click="$emit('select', note)"
      >
        <span>{{ note.icon || '📄' }}</span>
        <span>
          <strong>{{ note.title }}</strong>
          <small>{{ note.id }}</small>
        </span>
      </button>
      <p v-if="filtered.length === 0">{{ emptyLabel }}</p>
    </div>
  </div>
</template>

<style scoped>
.canvas-note-picker {
  position: absolute;
  z-index: 50;
  top: 72px;
  left: 50%;
  width: min(420px, calc(100% - 32px));
  max-height: min(520px, calc(100% - 100px));
  padding: 12px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  background: var(--canvas-1);
  box-shadow: var(--shadow-3);
  transform: translateX(-50%);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

header button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 8px;
  color: var(--text-secondary);
  background: transparent;
}

label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}

input {
  width: 100%;
  height: 38px;
  border: 0;
  color: var(--text-primary);
  background: transparent;
  outline: none;
}

.canvas-note-picker__list {
  display: grid;
  gap: 4px;
  max-height: 380px;
  margin-top: 8px;
  overflow-y: auto;
}

.canvas-note-picker__list button {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 8px;
  min-height: 54px;
  padding: 8px;
  border: 0;
  border-radius: 10px;
  color: var(--text-primary);
  text-align: left;
  background: transparent;
}

.canvas-note-picker__list button:hover,
.canvas-note-picker__list button:focus-visible {
  background: var(--hover-bg);
  outline: none;
}

.canvas-note-picker__list button > span:last-child {
  display: grid;
  min-width: 0;
}

small {
  overflow: hidden;
  color: var(--text-secondary);
  text-overflow: ellipsis;
}
</style>
