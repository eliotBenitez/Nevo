<script setup lang="ts">
import { ChevronLeft, ChevronRight, X } from '@lucide/vue'

defineProps<{
  active: boolean
  current: number
  total: number
  title: string
  previousLabel: string
  nextLabel: string
  exitLabel: string
}>()

defineEmits<{ previous: []; next: []; exit: [] }>()
</script>

<template>
  <div v-if="active" class="canvas-presentation-controls tw:absolute tw:bottom-[22px] tw:left-1/2 tw:z-60 tw:flex tw:min-h-[46px] tw:-translate-x-1/2 tw:items-center tw:gap-1 tw:rounded-[14px] tw:border tw:border-solid tw:border-(--border-subtle) tw:bg-[color-mix(in_srgb,var(--surface-canvas)_94%,transparent)] tw:p-[5px] tw:text-content-primary tw:shadow-(--shadow-3)" role="toolbar" :aria-label="title" @pointerdown.stop>
    <button type="button" class="tw:grid tw:size-9 tw:place-items-center tw:rounded-[9px] tw:border-0 tw:bg-transparent tw:p-0 tw:text-inherit tw:hover:bg-(--hover-bg) tw:hover:text-accent tw:focus-visible:bg-(--hover-bg) tw:focus-visible:text-accent" :aria-label="previousLabel" @click="$emit('previous')"><ChevronLeft :size="19" /></button>
    <output class="tw:min-w-16 tw:text-center tw:text-[13px]" aria-live="polite">{{ current + 1 }} / {{ total }}</output>
    <button type="button" class="tw:grid tw:size-9 tw:place-items-center tw:rounded-[9px] tw:border-0 tw:bg-transparent tw:p-0 tw:text-inherit tw:hover:bg-(--hover-bg) tw:hover:text-accent tw:focus-visible:bg-(--hover-bg) tw:focus-visible:text-accent" :aria-label="nextLabel" @click="$emit('next')"><ChevronRight :size="19" /></button>
    <span class="tw:h-6 tw:w-px tw:bg-(--border-subtle)" aria-hidden="true" />
    <button type="button" class="tw:grid tw:size-9 tw:place-items-center tw:rounded-[9px] tw:border-0 tw:bg-transparent tw:p-0 tw:text-inherit tw:hover:bg-(--hover-bg) tw:hover:text-accent tw:focus-visible:bg-(--hover-bg) tw:focus-visible:text-accent" :aria-label="exitLabel" @click="$emit('exit')"><X :size="19" /></button>
  </div>
</template>
