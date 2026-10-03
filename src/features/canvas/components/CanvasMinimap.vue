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
  <div v-if="allBounds" class="canvas-minimap tw:absolute tw:right-4 tw:bottom-4 tw:z-20 tw:h-[116px] tw:w-44 tw:overflow-hidden tw:rounded-xl tw:border tw:border-solid tw:border-(--border-subtle) tw:bg-[color-mix(in_srgb,var(--surface-canvas)_88%,transparent)] tw:shadow-(--shadow-raised) tw:max-[720px]:hidden" aria-hidden="true">
    <div
      class="canvas-minimap__block tw:absolute tw:rounded-[2px] tw:bg-content-muted tw:opacity-50"
      :style="{
        left: `${(effectiveFrame.x - allBounds.x) * scale}px`,
        top: `${(effectiveFrame.y - allBounds.y) * scale}px`,
        width: `${Math.max(2, effectiveFrame.width * scale)}px`,
        height: `${Math.max(2, effectiveFrame.height * scale)}px`,
      }"
    />
    <div
      class="canvas-minimap__viewport tw:absolute tw:border tw:border-solid tw:border-accent tw:bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
      :style="{
        left: `${(camera.x - allBounds.x) * scale}px`,
        top: `${(camera.y - allBounds.y) * scale}px`,
        width: `${viewportWidth / camera.zoom * scale}px`,
        height: `${viewportHeight / camera.zoom * scale}px`,
      }"
    />
  </div>
</template>
