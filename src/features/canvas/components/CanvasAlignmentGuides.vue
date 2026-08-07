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
    class="canvas-alignment-guide"
    :class="`canvas-alignment-guide--${guide.axis}`"
    :style="guide.axis === 'x'
      ? { left: `${(guide.value - camera.x) * camera.zoom}px` }
      : { top: `${(guide.value - camera.y) * camera.zoom}px` }"
  />
</template>

<style scoped>
.canvas-alignment-guide {
  position: absolute;
  z-index: 18;
  pointer-events: none;
  background: var(--accent);
  opacity: 0.75;
}

.canvas-alignment-guide--x {
  top: 0;
  bottom: 0;
  width: 1px;
}

.canvas-alignment-guide--y {
  right: 0;
  left: 0;
  height: 1px;
}
</style>
