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
    class="canvas-note-picker tw:absolute tw:z-50 tw:top-[72px] tw:left-1/2 tw:w-[min(420px,calc(100%-32px))] tw:max-h-[min(520px,calc(100%-100px))] tw:overflow-hidden tw:rounded-2xl tw:border tw:border-solid tw:border-(--border-subtle) tw:bg-surface-canvas tw:p-3 tw:shadow-(--shadow-3) tw:-translate-x-1/2"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    @keydown.esc="$emit('close')"
    @pointerdown.stop
  >
    <header class="tw:flex tw:items-center tw:justify-between tw:mb-2.5">
      <strong>{{ title }}</strong>
      <button
        type="button"
        class="tw:grid tw:size-8 tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[8px] tw:text-content-secondary tw:bg-transparent"
        :aria-label="closeLabel"
        @click="$emit('close')"
      ><X :size="17" /></button>
    </header>
    <label class="tw:flex tw:items-center tw:gap-2 tw:px-2.5 tw:border tw:border-solid tw:border-(--border-subtle) tw:rounded-[10px]">
      <Search :size="15" />
      <input
        ref="input"
        v-model="query"
        type="search"
        class="tw:w-full tw:h-[38px] tw:border-0 tw:text-content-primary tw:bg-transparent tw:outline-none"
        :placeholder="searchLabel"
        @keydown.esc="$emit('close')"
      >
    </label>
    <div class="canvas-note-picker__list tw:grid tw:gap-1 tw:max-h-[380px] tw:mt-2 tw:overflow-y-auto" role="listbox">
      <button
        v-for="note in filtered"
        :key="note.id"
        type="button"
        role="option"
        class="tw:grid tw:grid-cols-[28px_1fr] tw:gap-2 tw:min-h-[54px] tw:p-2 tw:border-0 tw:rounded-[10px] tw:text-content-primary tw:text-left tw:bg-transparent tw:hover:bg-(--hover-bg) tw:hover:outline-none tw:focus-visible:bg-(--hover-bg) tw:focus-visible:outline-none"
        @click="$emit('select', note)"
      >
        <span>{{ note.icon || '📄' }}</span>
        <span class="tw:grid tw:min-w-0">
          <strong>{{ note.title }}</strong>
          <small class="tw:overflow-hidden tw:text-content-secondary tw:text-ellipsis">{{ note.id }}</small>
        </span>
      </button>
      <p v-if="filtered.length === 0">{{ emptyLabel }}</p>
    </div>
  </div>
</template>
