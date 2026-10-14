<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Move, RotateCw } from '../../../ui/icons'
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
    class="notebook-ruler tw:pointer-events-none tw:text-[#234d43]" :transform="transform" role="group" :aria-label="t('notebook.ruler.label')"
    @pointerdown.stop @pointermove.stop @pointerup.stop @pointercancel.stop @lostpointercapture.stop @keydown.stop
  >
    <rect :x="-NOTEBOOK_RULER_LENGTH / 2" :y="-NOTEBOOK_RULER_HEIGHT / 2" :width="NOTEBOOK_RULER_LENGTH" :height="NOTEBOOK_RULER_HEIGHT" rx="2" class="notebook-ruler__body tw:fill-[rgb(211_235_226/78%)] tw:stroke-[#538f7e] tw:stroke-1 tw:[vector-effect:non-scaling-stroke]" />
    <g aria-hidden="true" class="notebook-ruler__scale">
      <g v-for="(tick, index) in ticks" :key="index">
        <line :x1="tick.x" :x2="tick.x" :y1="-NOTEBOOK_RULER_HEIGHT / 2" :y2="-NOTEBOOK_RULER_HEIGHT / 2 + tick.length" />
        <text v-if="tick.label" :x="tick.x" y="-7" text-anchor="middle">{{ tick.label }}</text>
      </g>
      <text x="-166" y="17">cm</text>
      <text x="156" y="17" text-anchor="end">{{ Math.round(pose.angle) }}°</text>
    </g>
    <g
      v-for="handle in handles" :key="handle.mode" :class="[`notebook-ruler__${handle.mode}`, handle.mode === 'move' ? 'tw:cursor-move' : 'tw:cursor-grab']" class="notebook-ruler__handle tw:group tw:touch-none tw:outline-none tw:[pointer-events:all] tw:aria-disabled:cursor-default tw:aria-disabled:opacity-45"
      :transform="`translate(${handle.x / zoom} 8) scale(${1 / zoom})`"
      role="button" tabindex="0" :aria-label="t(`notebook.ruler.${handle.mode}`)" :aria-disabled="disabled"
      :aria-description="t(`notebook.ruler.${handle.mode}Hint`)"
      @pointerdown="control.down($event, handle.mode)" @pointermove="control.move" @pointerup="control.up"
      @pointercancel="control.finish" @lostpointercapture="control.finish" @keydown="control.key($event, handle.mode)"
    >
      <title>{{ t(`notebook.ruler.${handle.mode}Hint`) }}</title>
      <rect x="-23" y="-23" width="46" height="46" rx="7" class="notebook-ruler__hit tw:fill-transparent" />
      <circle r="15" class="notebook-ruler__control tw:fill-[#f6faf8] tw:stroke-[#96b6ac] tw:group-focus-visible:stroke-focus-ring tw:group-focus-visible:stroke-[3]" />
      <component :is="handle.icon" x="-8" y="-8" :size="16" aria-hidden="true" />
    </g>
  </g>
</template>

<style scoped>
/* Remaining CSS: child-element selectors (.notebook-ruler__scale line/text) inside the SVG scale group. */
.notebook-ruler__scale line { stroke: #42685e; stroke-width: .6; }
.notebook-ruler__scale text { fill: #234d43; font: 8px var(--font-ui); }
</style>
