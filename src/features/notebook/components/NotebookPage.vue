<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { clampNotebookTranslation, notebookStrokeOutlineData, notebookStrokeOutlinePath } from '../../../core/notebook/geometry'
import { notebookArrowSegments } from '../../../core/notebook/arrow'
import { notebookLineSegments } from '../../../core/notebook/line'
import { isNotebookShapeKind, notebookShapePoints } from '../../../core/notebook/shape'
import { NOTEBOOK_PAPER_LINE_COLOR, NOTEBOOK_PAPER_LINE_WIDTH, paperLines } from '../../../core/notebook/paper'
import { isNotebookStroke } from '../../../core/notebook/types'
import type { NotebookLineStyle, NotebookPageV1, NotebookPointV1, NotebookStrokeV1 } from '../../../core/notebook/types'
import type { NotebookInputTool } from '../composables/useNotebookInput'
import type { NotebookRulerPose } from '../../../core/notebook/ruler'
import NotebookImageObject from './NotebookImageObject.vue'
import NotebookRuler from './NotebookRuler.vue'
import NotebookLaserLayer from './NotebookLaserLayer.vue'
import NotebookSelectionOverlay from './NotebookSelectionOverlay.vue'
import { useNotebookSelectionTransform } from '../composables/useNotebookSelectionTransform'
import type { NotebookSelectionTransform } from '../../../core/notebook/selectionTransform'
import type { NotebookLaserTrace } from '../composables/useNotebookLaser'

const props = defineProps<{
  page: NotebookPageV1
  pageNumber: number
  zoom: number
  tool: NotebookInputTool
  activePoints: NotebookPointV1[]
  /** Draw the live pen/marker preview with the modeled-stroke geometry, like the stored stroke. */
  activeModeled?: boolean
  strokeColor: string
  strokeWidth: number
  markerWidth: number
  eraserDiameter: number
  selectedObjectIds: string[]
  penActive: boolean
  lineDash: NotebookLineStyle
  ruler?: NotebookRulerPose | null
  inputActive?: boolean
  laserTraces?: NotebookLaserTrace[]
  ghost?: boolean
}>()

const emit = defineEmits<{
  pointerdown: [event: PointerEvent]
  pointermove: [event: PointerEvent]
  pointerup: [event: PointerEvent]
  pointercancel: [event: PointerEvent]
  lostpointercapture: [event: PointerEvent]
  selectionTransform: [transform: NotebookSelectionTransform]
  selectionActive: [active: boolean]
  rulerUpdate: [pose: NotebookRulerPose]
  rulerActive: [active: boolean]
}>()

const selectionVisible = computed(() => (props.tool === 'lasso' || props.tool === 'move') && props.selectedObjectIds.length > 0)
const selection = useNotebookSelectionTransform({
  page: () => props.page, ids: () => props.selectedObjectIds, zoom: () => props.zoom,
  disabled: () => !!props.inputActive || !selectionVisible.value,
  commit: transform => emit('selectionTransform', transform), active: active => emit('selectionActive', active),
})

const strokePathCache = new WeakMap<NotebookStrokeV1, string>()

function pathFor(object: NotebookStrokeV1): string {
  let path = strokePathCache.get(object)
  if (!path) {
    path = notebookStrokeOutlineData(object.points, object.width, object.kind === 'highlighter', object.dash, object.path === 'modeled')
    strokePathCache.set(object, path)
  }
  return path
}

const { t } = useI18n()

const lines = computed(() => paperLines(props.page.paper.kind, props.page.width, props.page.height))
// Objects render in one z-ordered list so ink drawn after an image stays on top of it.
const items = computed(() => (selection.preview.value ?? props.page).objects.map(object => {
  const selected = props.selectedObjectIds.includes(object.id)
  return isNotebookStroke(object)
    ? { id: object.id, selected, image: null, d: pathFor(object), color: object.color, opacity: object.opacity }
    : { id: object.id, selected, image: object, d: '', color: '', opacity: object.opacity }
}))
const activePath = computed(() => props.activePoints.length && (props.tool === 'pen' || props.tool === 'marker')
  ? notebookStrokeOutlinePath(props.activePoints, props.tool === 'marker' ? props.markerWidth : props.strokeWidth, props.tool === 'marker', props.activeModeled === true)
  : '')
const arrowPaths = computed(() => props.tool === 'arrow'
  ? notebookArrowSegments(props.activePoints, props.strokeWidth).map(points => notebookStrokeOutlinePath(points, props.strokeWidth))
  : [])
const linePaths = computed(() => props.tool === 'line'
  ? notebookLineSegments(props.activePoints, props.strokeWidth, props.lineDash).map(points => notebookStrokeOutlinePath(points, props.strokeWidth))
  : [])
const shapePreview = computed(() => isNotebookShapeKind(props.tool)
  ? notebookShapePoints(props.activePoints, props.tool)
  : [])
const shapePath = computed(() => shapePreview.value.length
  ? notebookStrokeOutlinePath(shapePreview.value, props.strokeWidth)
  : '')
const movePreview = computed(() => {
  if (props.tool !== 'move' || props.activePoints.length < 2 || !props.selectedObjectIds.length) return null
  const start = props.activePoints[0]!
  const end = props.activePoints[props.activePoints.length - 1]!
  const selected = props.page.objects.filter(object => props.selectedObjectIds.includes(object.id))
  const delta = clampNotebookTranslation(selected, end.x - start.x, end.y - start.y, props.page.width, props.page.height)
  return { x: delta.dx, y: delta.dy }
})
const eraserPreview = computed(() => props.tool === 'eraser' && props.activePoints.length
  ? props.activePoints[props.activePoints.length - 1]
  : null)
const accessibleLabel = computed(() => props.ghost ? t('notebook.pages.ghost') : t('notebook.pages.accessibleSummary', {
  page: props.pageNumber,
  marks: props.page.objects.length,
  paper: t(`notebook.paper.${props.page.paper.kind}`),
}))
</script>

<template>
  <section class="notebook-page-shell tw:relative tw:mb-2 tw:grid tw:justify-items-center tw:px-[30px] tw:pt-2 tw:pb-7" :aria-label="accessibleLabel" role="group">
    <div class="notebook-page-gutter tw:absolute tw:top-[18px] tw:left-2 tw:text-[11px] tw:text-content-muted tw:tabular-nums" :class="{ 'notebook-page-gutter--ghost tw:opacity-50': ghost }" aria-hidden="true">{{ pageNumber }}</div>
    <svg
      class="notebook-page tw:block tw:flex-none tw:touch-none tw:overflow-hidden tw:border tw:border-[rgb(20_24_29/8%)] tw:bg-[#fff] tw:select-none tw:[box-shadow:0_2px_10px_rgb(16_22_28/9%)] tw:motion-reduce:[scroll-behavior:auto] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-[3px] tw:focus-visible:outline-focus-ring"
      :class="{ 'notebook-page--pen-active': penActive }"
      :width="page.width * zoom"
      :height="page.height * zoom"
      :viewBox="`0 0 ${page.width} ${page.height}`"
      :aria-label="accessibleLabel"
      :role="ruler || selectionVisible ? 'group' : 'img'"
      tabindex="0"
      @pointerdown="emit('pointerdown', $event)"
      @pointermove="emit('pointermove', $event)"
      @pointerup="emit('pointerup', $event)"
      @pointercancel="emit('pointercancel', $event)"
      @lostpointercapture="emit('lostpointercapture', $event)"
    >
      <rect x="0" y="0" :width="page.width" :height="page.height" fill="#fff" />
      <g class="notebook-paper-lines" aria-hidden="true">
        <line v-for="(line, index) in lines" :key="index" v-bind="line" />
      </g>
      <g class="notebook-ink" aria-hidden="true">
        <g v-if="arrowPaths.length" class="notebook-arrow-preview">
          <path v-for="(path, index) in arrowPaths" :key="index" :d="path" :fill="strokeColor" />
        </g>
        <g v-if="linePaths.length" class="notebook-line-preview">
          <path v-for="(path, index) in linePaths" :key="index" :d="path" :fill="strokeColor" />
        </g>
        <g v-if="shapePath" class="notebook-shape-preview">
          <path :d="shapePath" :fill="strokeColor" />
        </g>
        <template v-for="item in items" :key="item.id">
          <NotebookImageObject
            v-if="item.image"
            :image="item.image"
            :selected="item.selected"
            :transform="item.selected && movePreview ? `translate(${movePreview.x} ${movePreview.y})` : undefined"
          />
          <path
            v-else
            :d="item.d"
            :fill="item.color"
            :opacity="item.opacity"
            :transform="item.selected && movePreview ? `translate(${movePreview.x} ${movePreview.y})` : undefined"
            :class="{ 'notebook-ink__path--selected tw:[filter:drop-shadow(0_0_1.5px_var(--accent))]': item.selected }"
          />
        </template>
        <path
          v-if="activePath && tool !== 'eraser' && tool !== 'lasso'"
          :d="activePath"
          :fill="strokeColor"
          :opacity="tool === 'marker' ? 0.25 : 1"
        />
        <path
          v-else-if="activePoints.length > 1 && tool === 'lasso'"
          :d="`M ${activePoints.map(point => `${point.x},${point.y}`).join(' L ')} Z`"
          class="notebook-lasso-preview tw:fill-[color-mix(in_oklab,var(--accent)_8%,transparent)] tw:stroke-accent tw:stroke-[1.4] tw:[stroke-dasharray:5_4] tw:[vector-effect:non-scaling-stroke]"
        />
        <circle
          v-if="eraserPreview"
          :cx="eraserPreview.x"
          :cy="eraserPreview.y"
          :r="eraserDiameter / 2"
          class="notebook-eraser-preview tw:pointer-events-none tw:fill-[rgb(90_97_105/14%)] tw:stroke-content-muted tw:stroke-1"
        />
      </g>
      <NotebookRuler v-if="ruler" :pose="ruler" :zoom="zoom" :width="page.width" :height="page.height" :disabled="!!inputActive" @update="emit('rulerUpdate', $event)" @active="emit('rulerActive', $event)" />
      <NotebookSelectionOverlay
        v-if="selectionVisible && selection.bounds.value" :bounds="selection.bounds.value" :zoom="zoom" :page-width="page.width" :page-height="page.height" :disabled="!!inputActive"
        @down="selection.down" @move="selection.move" @up="selection.up" @cancel="selection.cancel" @key="selection.key"
      />
      <NotebookLaserLayer :traces="laserTraces ?? []" :active-points="tool === 'laser' ? activePoints : []" :color="strokeColor" :width="strokeWidth" />
    </svg>
  </section>
</template>

<style scoped>
/* Remaining CSS: v-bind() on SVG child selectors (the paper-line stroke is a JS constant). */
.notebook-paper-lines line {
  stroke: v-bind('NOTEBOOK_PAPER_LINE_COLOR');
  stroke-width: v-bind('NOTEBOOK_PAPER_LINE_WIDTH');
}
</style>
