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
    class="canvas-connector-handle tw:absolute tw:z-22 tw:size-3.5 tw:-translate-1/2 tw:cursor-crosshair tw:rounded-full tw:border-2 tw:border-solid tw:border-accent tw:bg-surface-canvas tw:p-0 tw:data-[bound=true]:bg-accent"
    :class="{ 'is-bound': item.point.binding }"
    :data-bound="!!item.point.binding"
    :style="{
      left: `${(item.point.x - camera.x) * camera.zoom}px`,
      top: `${(item.point.y - camera.y) * camera.zoom}px`,
    }"
    :aria-label="item.label"
    :title="item.label"
    @pointerdown.stop="$emit('endpoint', item.endpoint, $event)"
  />
</template>
