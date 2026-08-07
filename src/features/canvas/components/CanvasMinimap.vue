<script setup lang="ts">
import { computed } from 'vue'
import { unionBounds, type CanvasBounds, type CanvasCamera, type CanvasSnapshotV1 } from '../../../core/canvas'

const props = defineProps<{
  snapshot: CanvasSnapshotV1
  effectiveFrame: CanvasBounds
  camera: CanvasCamera
  viewportWidth: number
  viewportHeight: number
}>()

const allBounds = computed(() => unionBounds([
  props.effectiveFrame,
  ...Object.values(props.snapshot.elements),
]))

const scale = computed(() => {
  const bounds = allBounds.value
  if (!bounds) return 1
  return Math.min(160 / Math.max(1, bounds.width), 100 / Math.max(1, bounds.height))
})
</script>

<template>
  <div v-if="allBounds" class="canvas-minimap" aria-hidden="true">
    <div
      class="canvas-minimap__block"
      :style="{
        left: `${(effectiveFrame.x - allBounds.x) * scale}px`,
        top: `${(effectiveFrame.y - allBounds.y) * scale}px`,
        width: `${Math.max(2, effectiveFrame.width * scale)}px`,
        height: `${Math.max(2, effectiveFrame.height * scale)}px`,
      }"
    />
    <div
      class="canvas-minimap__viewport"
      :style="{
        left: `${(camera.x - allBounds.x) * scale}px`,
        top: `${(camera.y - allBounds.y) * scale}px`,
        width: `${viewportWidth / camera.zoom * scale}px`,
        height: `${viewportHeight / camera.zoom * scale}px`,
      }"
    />
  </div>
</template>

<style scoped>
.canvas-minimap {
  position: absolute;
  z-index: 20;
  right: 16px;
  bottom: 16px;
  width: 176px;
  height: 116px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: color-mix(in srgb, var(--canvas-1) 88%, transparent);
  box-shadow: var(--shadow-1);
}

.canvas-minimap__block {
  position: absolute;
  border-radius: 2px;
  background: var(--text-3);
  opacity: 0.5;
}

.canvas-minimap__viewport {
  position: absolute;
  border: 1px solid var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

@media (max-width: 720px) {
  .canvas-minimap {
    display: none;
  }
}
</style>
