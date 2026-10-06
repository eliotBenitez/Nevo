<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Move, RotateCw } from '@lucide/vue'
import type { NotebookSelectionBounds } from '../../../core/notebook/selectionTransform'
import type { NotebookSelectionHandle } from '../composables/useNotebookSelectionTransform'

const props = defineProps<{ bounds: NotebookSelectionBounds; zoom: number; pageWidth: number; pageHeight: number; disabled: boolean }>()
const emit = defineEmits<{
  down: [event: PointerEvent, mode: NotebookSelectionHandle]
  move: [event: PointerEvent]
  up: [event: PointerEvent]
  cancel: [event: PointerEvent]
  key: [event: KeyboardEvent, mode: NotebookSelectionHandle]
}>()
const { t } = useI18n()
const controlBounds = computed(() => {
  const b = props.bounds, margin = 22 / props.zoom
  const width = Math.min(props.pageWidth - 2 * margin, Math.max(b.width, 96 / props.zoom))
  const height = Math.min(props.pageHeight - 2 * margin, Math.max(b.height, 96 / props.zoom))
  // Small marks still need distinct touch targets, including at a page edge.
  return { x: Math.max(margin, Math.min(props.pageWidth - margin - width, b.x + (b.width - width) / 2)),
    y: Math.max(margin, Math.min(props.pageHeight - margin - height, b.y + (b.height - height) / 2)), width, height }
})
const handles = computed(() => {
  const b = controlBounds.value, z = props.zoom, margin = 22 / z
  const safe = (value: number, max: number) => Math.max(margin, Math.min(max - margin, value))
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2
  return [
    { mode: 'scale-nw' as const, x: b.x, y: b.y },
    { mode: 'scale-ne' as const, x: b.x + b.width, y: b.y },
    { mode: 'scale-sw' as const, x: b.x, y: b.y + b.height },
    { mode: 'scale-se' as const, x: b.x + b.width, y: b.y + b.height },
    { mode: 'move' as const, x: cx, y: cy, icon: Move },
    { mode: 'rotate' as const, x: cx, y: b.y >= 50 / z ? b.y - 30 / z : b.y + b.height + 30 / z, icon: RotateCw },
  ].map(handle => ({ ...handle, x: safe(handle.x, props.pageWidth), y: safe(handle.y, props.pageHeight) }))
})
</script>

<template>
  <g
    class="notebook-selection" role="group" :aria-label="t('notebook.selection.label')"
    @pointerdown.stop @pointermove.stop @pointerup.stop @pointercancel.stop @lostpointercapture.stop
  >
    <rect v-bind="controlBounds" class="notebook-selection__bounds" />
    <g
      v-for="handle in handles" :key="handle.mode" class="notebook-selection__handle" :class="`notebook-selection__${handle.mode}`"
      :transform="`translate(${handle.x} ${handle.y}) scale(${1 / zoom})`" role="button" tabindex="0" :aria-disabled="disabled"
      :aria-label="t(`notebook.selection.${handle.mode.startsWith('scale') ? 'scale' : handle.mode}`)" :aria-description="t('notebook.selection.handleHint')"
      @pointerdown="emit('down', $event, handle.mode)" @pointermove="emit('move', $event)" @pointerup="emit('up', $event)"
      @pointercancel="emit('cancel', $event)" @lostpointercapture="emit('cancel', $event)" @keydown="emit('key', $event, handle.mode)"
    >
      <title>{{ t('notebook.selection.handleHint') }}</title>
      <rect x="-22" y="-22" width="44" height="44" class="notebook-selection__hit" />
      <circle v-if="handle.icon" r="13" class="notebook-selection__control" />
      <rect v-else x="-5" y="-5" width="10" height="10" rx="2" class="notebook-selection__control" />
      <component :is="handle.icon" v-if="handle.icon" x="-7" y="-7" :size="14" aria-hidden="true" />
    </g>
  </g>
</template>

<style scoped>
.notebook-selection { pointer-events:none; color:var(--accent); }
.notebook-selection__bounds { fill:none; stroke:var(--accent); stroke-width:1; stroke-dasharray:4 3; vector-effect:non-scaling-stroke; }
.notebook-selection__handle { pointer-events:all; touch-action:none; outline:none; cursor:nwse-resize; }
.notebook-selection__scale-ne, .notebook-selection__scale-sw { cursor:nesw-resize; }
.notebook-selection__move { cursor:move; }
.notebook-selection__rotate { cursor:grab; }
.notebook-selection__hit { fill:transparent; }
.notebook-selection__control { fill:var(--surface-raised); stroke:var(--accent); stroke-width:1.5; }
.notebook-selection__handle:focus-visible .notebook-selection__control { stroke:var(--focus-ring); stroke-width:3; }
.notebook-selection__handle[aria-disabled="true"] { opacity:.4; cursor:default; }
</style>
