<script setup lang="ts">
import { computed } from 'vue'
import type { NotebookPointV1 } from '../../../core/notebook/types'
import { notebookStrokeOutlinePath } from '../../../core/notebook/geometry'
import { NOTEBOOK_LASER_LIFETIME_MS, NOTEBOOK_LASER_POINT_LIMIT } from '../composables/useNotebookLaser'
import type { NotebookLaserTrace } from '../composables/useNotebookLaser'

const props = defineProps<{ traces: NotebookLaserTrace[]; activePoints: NotebookPointV1[]; color: string; width: number }>()
const activePath = computed(() => notebookStrokeOutlinePath(props.activePoints.slice(-NOTEBOOK_LASER_POINT_LIMIT), props.width))
const head = computed(() => props.activePoints[props.activePoints.length - 1])
</script>

<template>
  <g class="notebook-laser" aria-hidden="true" :style="{ '--laser-duration': `${NOTEBOOK_LASER_LIFETIME_MS}ms` }">
    <g v-for="trace in traces" :key="trace.id" class="notebook-laser__trace" :style="{ color: trace.color }">
      <path :d="trace.path" :fill="trace.color" />
      <circle :cx="trace.head.x" :cy="trace.head.y" :r="trace.width * .35" fill="#fff" />
    </g>
    <g v-if="head" class="notebook-laser__active" :style="{ color }">
      <path :d="activePath" :fill="color" />
      <circle :cx="head.x" :cy="head.y" :r="width * .35" fill="#fff" />
    </g>
  </g>
</template>

<style scoped>
.notebook-laser { pointer-events: none; }
.notebook-laser__trace, .notebook-laser__active { filter: drop-shadow(0 0 2px currentColor); }
.notebook-laser__trace { animation: notebook-laser-fade var(--laser-duration) linear forwards; }
@keyframes notebook-laser-fade { 0%, 25% { opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .notebook-laser__trace { animation: none; } }
</style>
