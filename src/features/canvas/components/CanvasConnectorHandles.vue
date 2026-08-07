<script setup lang="ts">
import { computed } from 'vue'
import type { CanvasCamera, CanvasConnector } from '../../../core/canvas'

const props = defineProps<{
  connector: CanvasConnector
  camera: CanvasCamera
  fromLabel: string
  toLabel: string
}>()

defineEmits<{
  endpoint: [endpoint: 'from' | 'to', event: PointerEvent]
}>()

const endpoints = computed(() => (['from', 'to'] as const).map(endpoint => ({
  endpoint,
  point: props.connector[endpoint],
  label: endpoint === 'from' ? props.fromLabel : props.toLabel,
})))
</script>

<template>
  <button
    v-for="item in endpoints"
    :key="item.endpoint"
    type="button"
    class="canvas-connector-handle"
    :class="{ 'is-bound': item.point.binding }"
    :style="{
      left: `${(item.point.x - camera.x) * camera.zoom}px`,
      top: `${(item.point.y - camera.y) * camera.zoom}px`,
    }"
    :aria-label="item.label"
    :title="item.label"
    @pointerdown.stop="$emit('endpoint', item.endpoint, $event)"
  />
</template>

<style scoped>
.canvas-connector-handle {
  position: absolute;
  z-index: 22;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 2px solid var(--accent);
  border-radius: 50%;
  background: var(--canvas-1);
  transform: translate(-50%, -50%);
  cursor: crosshair;
}

.canvas-connector-handle.is-bound {
  background: var(--accent);
}
</style>
