<script setup lang="ts">
import type { CanvasCamera } from '../../../core/canvas'

defineProps<{
  guides: readonly { axis: 'x' | 'y'; value: number }[]
  camera: CanvasCamera
}>()
</script>

<template>
  <div
    v-for="(guide, index) in guides"
    :key="`${guide.axis}:${guide.value}:${index}`"
    class="canvas-alignment-guide tw:pointer-events-none tw:absolute tw:z-18 tw:bg-accent tw:opacity-75"
    :class="{
      'canvas-alignment-guide--x tw:inset-y-0 tw:w-px': guide.axis === 'x',
      'canvas-alignment-guide--y tw:inset-x-0 tw:h-px': guide.axis === 'y',
    }"
    :style="guide.axis === 'x'
      ? { left: `${(guide.value - camera.x) * camera.zoom}px` }
      : { top: `${(guide.value - camera.y) * camera.zoom}px` }"
  />
</template>
