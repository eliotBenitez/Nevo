<script setup lang="ts">
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next'

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
  <div v-if="active" class="canvas-presentation-controls" role="toolbar" :aria-label="title" @pointerdown.stop>
    <button type="button" :aria-label="previousLabel" @click="$emit('previous')"><ChevronLeft :size="19" /></button>
    <output aria-live="polite">{{ current + 1 }} / {{ total }}</output>
    <button type="button" :aria-label="nextLabel" @click="$emit('next')"><ChevronRight :size="19" /></button>
    <span aria-hidden="true" />
    <button type="button" :aria-label="exitLabel" @click="$emit('exit')"><X :size="19" /></button>
  </div>
</template>

<style scoped>
.canvas-presentation-controls {
  position: absolute;
  z-index: 60;
  bottom: 22px;
  left: 50%;
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 46px;
  padding: 5px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--canvas-1) 94%, transparent);
  box-shadow: var(--shadow-3);
  transform: translateX(-50%);
  backdrop-filter: blur(18px);
}

button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 9px;
  color: inherit;
  background: transparent;
}

button:hover,
button:focus-visible {
  color: var(--accent);
  background: var(--hover-bg);
}

output {
  min-width: 64px;
  font-size: 13px;
  text-align: center;
}

span {
  width: 1px;
  height: 24px;
  background: var(--border-subtle);
}
</style>
