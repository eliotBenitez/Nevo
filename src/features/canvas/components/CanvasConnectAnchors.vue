<script setup lang="ts">
import type { CanvasCamera, CanvasConnectorSide, CanvasPoint } from '../../../core/canvas'

defineProps<{
  anchors: readonly { side: CanvasConnectorSide; point: CanvasPoint }[]
  camera: CanvasCamera
  label: string
}>()

defineEmits<{
  'anchor-pointerdown': [side: CanvasConnectorSide, event: PointerEvent]
}>()
</script>

<template>
  <div class="edgeless-canvas__connect-anchors tw:absolute tw:inset-0 tw:z-21 tw:pointer-events-none">
    <button
      v-for="anchor in anchors"
      :key="anchor.side"
      type="button"
      class="edgeless-canvas__connect-anchor tw:absolute tw:size-2.5 tw:p-0 tw:-translate-1/2 tw:cursor-crosshair tw:rounded-full tw:border-2 tw:border-solid tw:border-(--island-bg) tw:bg-accent tw:pointer-events-auto tw:transition-transform tw:duration-100 tw:hover:scale-[1.35] tw:focus-visible:scale-[1.35] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent"
      :style="{
        left: `${(anchor.point.x - camera.x) * camera.zoom}px`,
        top: `${(anchor.point.y - camera.y) * camera.zoom}px`,
      }"
      :aria-label="label"
      :title="label"
      @pointerdown.stop="$emit('anchor-pointerdown', anchor.side, $event)"
    />
  </div>
</template>
