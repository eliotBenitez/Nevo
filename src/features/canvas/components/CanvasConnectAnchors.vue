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
  <div class="edgeless-canvas__connect-anchors">
    <button
      v-for="anchor in anchors"
      :key="anchor.side"
      type="button"
      class="edgeless-canvas__connect-anchor"
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
