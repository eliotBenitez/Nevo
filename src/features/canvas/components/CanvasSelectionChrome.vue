<script setup lang="ts">
import { LockKeyhole, RotateCw } from '@lucide/vue'
import type { CSSProperties } from 'vue'

defineProps<{
  chromeStyle: CSSProperties
  locked?: boolean
  resizable?: boolean
  rotatable?: boolean
  rotateLabel: string
}>()

defineEmits<{
  resize: [event: PointerEvent]
  rotate: [event: PointerEvent]
}>()
</script>

<template>
  <div
    class="edgeless-canvas__selection tw:absolute tw:z-15 tw:rounded-[14px] tw:border-2 tw:border-solid tw:border-accent tw:pointer-events-none"
    :class="{ 'is-locked': locked }"
    :style="chromeStyle"
  >
    <LockKeyhole v-if="locked" class="canvas-selection__lock tw:absolute tw:-top-2 tw:-right-2 tw:rounded-full tw:bg-surface-canvas tw:p-[3px] tw:text-content-secondary" :size="14" aria-hidden="true" />
    <button
      v-if="rotatable && !locked"
      type="button"
      class="canvas-selection__rotate tw:pointer-events-auto tw:absolute tw:-top-8 tw:left-1/2 tw:grid tw:size-6 tw:-translate-x-1/2 tw:cursor-grab tw:place-items-center tw:rounded-full tw:border tw:border-solid tw:border-accent tw:bg-surface-canvas tw:p-0 tw:text-accent"
      :aria-label="rotateLabel"
      :title="rotateLabel"
      @pointerdown.stop="$emit('rotate', $event)"
    >
      <RotateCw :size="13" />
    </button>
    <span
      v-if="resizable && !locked"
      class="edgeless-canvas__resize-handle tw:absolute tw:-right-1.5 tw:-bottom-1.5 tw:pointer-events-auto tw:size-3 tw:cursor-nwse-resize tw:rounded-full tw:border-2 tw:border-solid tw:border-(--island-bg) tw:bg-accent"
      @pointerdown="$emit('resize', $event)"
    />
  </div>
</template>

<style scoped>
/* This unlayered selector must override the canvas outline in canvas.css. */
.is-locked {
  border-style: dashed;
}
</style>
