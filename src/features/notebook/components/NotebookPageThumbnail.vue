<script setup lang="ts">
import { computed } from 'vue'
import { notebookStrokeOutlineData } from '../../../core/notebook/geometry'
import { NOTEBOOK_PAPER_LINE_COLOR, NOTEBOOK_PAPER_LINE_WIDTH, paperLines } from '../../../core/notebook/paper'
import { isNotebookStroke } from '../../../core/notebook/types'
import type { NotebookPageV1, NotebookStrokeV1 } from '../../../core/notebook/types'
import NotebookImageObject from './NotebookImageObject.vue'

const props = defineProps<{ page: NotebookPageV1 }>()
const pathsCache = new WeakMap<NotebookStrokeV1, string>()
function pathFor(stroke: NotebookStrokeV1): string {
  let path = pathsCache.get(stroke)
  if (!path) {
    path = notebookStrokeOutlineData(stroke.points, stroke.width, stroke.kind === 'highlighter', stroke.dash, stroke.path === 'modeled')
    pathsCache.set(stroke, path)
  }
  return path
}
const lines = computed(() => paperLines(props.page.paper.kind, props.page.width, props.page.height))
</script>

<template>
  <svg :viewBox="`0 0 ${page.width} ${page.height}`" aria-hidden="true" focusable="false">
    <rect x="0" y="0" :width="page.width" :height="page.height" fill="#fff" />
    <g>
      <line v-for="(line, index) in lines" :key="index" v-bind="line" :stroke="NOTEBOOK_PAPER_LINE_COLOR" :stroke-width="NOTEBOOK_PAPER_LINE_WIDTH" />
    </g>
    <template v-for="object in page.objects" :key="object.id">
      <path v-if="isNotebookStroke(object)" :d="pathFor(object)" :fill="object.color" :fill-opacity="object.opacity" />
      <NotebookImageObject v-else :image="object" />
    </template>
  </svg>
</template>

<style scoped>
svg { display:block; width:100%; height:100%; }
</style>
