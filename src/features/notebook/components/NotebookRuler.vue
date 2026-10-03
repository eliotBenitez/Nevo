<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Move, RotateCw } from 'lucide-vue-next'
import { NOTEBOOK_POINTS_PER_MM, NOTEBOOK_RULER_HEIGHT, NOTEBOOK_RULER_LENGTH } from '../../../core/notebook/ruler'
import type { NotebookRulerPose } from '../../../core/notebook/ruler'
import { useNotebookRuler } from '../composables/useNotebookRuler'

const props = defineProps<{ pose: NotebookRulerPose; zoom: number; width: number; height: number; disabled: boolean }>()
const emit = defineEmits<{ update: [pose: NotebookRulerPose]; active: [active: boolean] }>()
const { t } = useI18n()
const control = useNotebookRuler({
  pose: () => props.pose, zoom: () => props.zoom, width: () => props.width, height: () => props.height,
  disabled: () => props.disabled, update: pose => emit('update', pose), active: active => emit('active', active),
})
const transform = computed(() => `translate(${props.pose.x} ${props.pose.y}) rotate(${props.pose.angle})`)
const ticks = Array.from({ length: 121 }, (_, mm) => ({
  x: -NOTEBOOK_RULER_LENGTH / 2 + 10 + mm * NOTEBOOK_POINTS_PER_MM,
  length: mm % 10 === 0 ? 12 : mm % 5 === 0 ? 8 : 4,
  label: mm % 10 === 0 ? String(mm / 10) : null,
}))
const handles = [{ mode: 'move' as const, x: -24, icon: Move }, { mode: 'rotate' as const, x: 24, icon: RotateCw }]
</script>

<template>
  <g
    class="notebook-ruler" :transform="transform" role="group" :aria-label="t('notebook.ruler.label')"
    @pointerdown.stop @pointermove.stop @pointerup.stop @pointercancel.stop @lostpointercapture.stop @keydown.stop
  >
    <rect :x="-NOTEBOOK_RULER_LENGTH / 2" :y="-NOTEBOOK_RULER_HEIGHT / 2" :width="NOTEBOOK_RULER_LENGTH" :height="NOTEBOOK_RULER_HEIGHT" rx="2" class="notebook-ruler__body" />
    <g aria-hidden="true" class="notebook-ruler__scale">
      <g v-for="(tick, index) in ticks" :key="index">
        <line :x1="tick.x" :x2="tick.x" :y1="-NOTEBOOK_RULER_HEIGHT / 2" :y2="-NOTEBOOK_RULER_HEIGHT / 2 + tick.length" />
        <text v-if="tick.label" :x="tick.x" y="-7" text-anchor="middle">{{ tick.label }}</text>
      </g>
      <text x="-166" y="17">cm</text>
      <text x="156" y="17" text-anchor="end">{{ Math.round(pose.angle) }}°</text>
    </g>
    <g
      v-for="handle in handles" :key="handle.mode" :class="`notebook-ruler__${handle.mode}`" class="notebook-ruler__handle"
      :transform="`translate(${handle.x / zoom} 8) scale(${1 / zoom})`"
      role="button" tabindex="0" :aria-label="t(`notebook.ruler.${handle.mode}`)" :aria-disabled="disabled"
      :aria-description="t(`notebook.ruler.${handle.mode}Hint`)"
      @pointerdown="control.down($event, handle.mode)" @pointermove="control.move" @pointerup="control.up"
      @pointercancel="control.finish" @lostpointercapture="control.finish" @keydown="control.key($event, handle.mode)"
    >
      <title>{{ t(`notebook.ruler.${handle.mode}Hint`) }}</title>
      <rect x="-23" y="-23" width="46" height="46" rx="7" class="notebook-ruler__hit" />
      <circle r="15" class="notebook-ruler__control" />
      <component :is="handle.icon" x="-8" y="-8" :size="16" aria-hidden="true" />
    </g>
  </g>
</template>

<style scoped>
.notebook-ruler { pointer-events: none; color: #234d43; }
.notebook-ruler__body { fill: rgb(211 235 226 / 78%); stroke: #538f7e; stroke-width: 1; vector-effect: non-scaling-stroke; }
.notebook-ruler__scale line { stroke: #42685e; stroke-width: .6; }
.notebook-ruler__scale text { fill: #234d43; font: 8px var(--font-ui); }
.notebook-ruler__handle { pointer-events: all; touch-action: none; outline: none; }
.notebook-ruler__move { cursor: move; }
.notebook-ruler__rotate { cursor: grab; }
.notebook-ruler__hit { fill: transparent; }
.notebook-ruler__control { fill: #f6faf8; stroke: #96b6ac; }
.notebook-ruler__handle:focus-visible .notebook-ruler__control { stroke: var(--focus-ring); stroke-width: 3; }
.notebook-ruler__handle[aria-disabled="true"] { opacity: .45; cursor: default; }
</style>
