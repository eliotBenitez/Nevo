<script setup lang="ts">
import { Download, Eraser, Hand, Highlighter, ImagePlus, LassoSelect, Minus, Move, MoveUpRight, PanelLeft, PenLine, Plus, Redo2, Ruler, Spline, Spotlight, Undo2 } from '../../../ui/icons'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvNumberInput from '../../../ui/primitives/NvNumberInput.vue'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NotebookShapePicker from './NotebookShapePicker.vue'
import NotebookColorControl from './NotebookColorControl.vue'
import { useNotebookToolbarLayout } from '../composables/useNotebookToolbarLayout'
import type { NotebookLineStyle, NotebookPaperKind } from '../../../core/notebook/types'
import type { NotebookEraserMode, NotebookInputTool } from '../composables/useNotebookInput'

const props = defineProps<{
  tool: NotebookInputTool
  pagesOpen: boolean
  color: string
  strokeWidth: number
  markerWidth: number
  eraserDiameter: number
  paper: NotebookPaperKind
  zoom: number
  canUndo: boolean
  canRedo: boolean
  exporting: boolean
  saveStatus: string
  error: string | null
  lineDash: NotebookLineStyle
  eraserMode?: NotebookEraserMode
  rulerOpen?: boolean
  importing?: boolean
  presets?: readonly string[]
  recents?: readonly string[]
  quickColors?: readonly string[]
}>()

const emit = defineEmits<{
  'update:tool': [tool: NotebookInputTool]
  'update:color': [color: string]
  'update:strokeWidth': [width: number]
  'update:markerWidth': [width: number]
  'update:eraserDiameter': [diameter: number]
  'update:paper': [paper: NotebookPaperKind]
  'update:lineDash': [dash: NotebookLineStyle]
  'update:eraserMode': [mode: NotebookEraserMode]
  addPreset: [color: string]
  removePreset: [color: string]
  undo: []
  redo: []
  zoomIn: []
  zoomOut: []
  togglePages: []
  toggleRuler: []
  insertImage: []
  export: []
}>()

const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
// Re-measure when the controls in the side groups change, not only on resize.
const { compact } = useNotebookToolbarLayout(root, () => [props.tool, props.quickColors?.length ?? 0, props.exporting])
const activeWidth = computed(() => props.tool === 'marker' ? props.markerWidth : props.tool === 'eraser' ? props.eraserDiameter : props.strokeWidth)
const widthRange = computed(() => props.tool === 'marker'
  ? { min: 2, max: 24, step: 0.5 }
  : props.tool === 'eraser'
    ? { min: 2, max: 40, step: 1 }
    : { min: 0.25, max: 8, step: 0.25 })
const tools = computed(() => [
  { id: 'pen' as const, label: t('notebook.tools.pen'), icon: PenLine },
  { id: 'marker' as const, label: t('notebook.tools.marker'), icon: Highlighter },
  { id: 'eraser' as const, label: t('notebook.tools.eraser'), icon: Eraser },
  { id: 'lasso' as const, label: t('notebook.tools.lasso'), icon: LassoSelect },
  { id: 'laser' as const, label: t('notebook.tools.laser'), icon: Spotlight },
  { id: 'arrow' as const, label: t('notebook.tools.arrow'), icon: MoveUpRight },
  { id: 'line' as const, label: t('notebook.tools.line'), icon: Minus },
  { id: 'move' as const, label: t('notebook.tools.move'), icon: Move },
  { id: 'hand' as const, label: t('notebook.tools.hand'), icon: Hand },
])
const dashOptions = computed(() => [
  { id: 'solid' as const, label: t('notebook.tools.lineSolid'), pattern: undefined },
  { id: 'dashed' as const, label: t('notebook.tools.lineDashed'), pattern: '4 3' },
  { id: 'dotted' as const, label: t('notebook.tools.lineDotted'), pattern: '0.1 3' },
])
const eraserModes = computed(() => [
  { id: 'partial' as const, label: t('notebook.tools.eraserPartial'), icon: Eraser },
  { id: 'stroke' as const, label: t('notebook.tools.eraserStroke'), icon: Spline },
])
const paperOptions = computed(() => [
  { value: 'plain', label: t('notebook.paper.plain') },
  { value: 'grid', label: t('notebook.paper.grid') },
  { value: 'ruled', label: t('notebook.paper.ruled') },
])

// On phones the tool strip scrolls horizontally; keep the active tool in view.
watch(() => props.tool, async () => {
  await nextTick()
  const active = root.value?.querySelector<HTMLElement>('.notebook-toolbar__tools [aria-pressed="true"]')
  if (active && typeof active.scrollIntoView === 'function') active.scrollIntoView({ block: 'nearest', inline: 'nearest' })
})

function updateWidth(width: number): void {
  if (props.tool === 'marker') emit('update:markerWidth', width)
  else if (props.tool === 'eraser') emit('update:eraserDiameter', width)
  else emit('update:strokeWidth', width)
}
</script>

<template>
  <header ref="root" class="notebook-toolbar tw:relative tw:z-2 tw:grid tw:min-h-11 tw:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] tw:items-center tw:gap-2 tw:border-b tw:border-border-subtle tw:bg-surface-panel tw:px-2.5 tw:py-[5px] tw:text-content-primary" :class="{ 'notebook-toolbar--compact': compact }" :aria-label="t('notebook.toolbar')">
    <div class="notebook-toolbar__left tw:col-1 tw:row-1 tw:flex tw:min-w-0 tw:items-center tw:gap-2 tw:justify-self-start">
      <NvButton
        class="notebook-toolbar__pages-toggle"
        variant="ghost"
        icon
        :aria-label="t(pagesOpen ? 'notebook.pages.close' : 'notebook.pages.open')"
        :aria-expanded="pagesOpen"
        @click="emit('togglePages')"
      >
        <PanelLeft :size="16" aria-hidden="true" />
      </NvButton>

      <div class="notebook-toolbar__style tw:flex tw:min-w-0 tw:items-center tw:gap-1.5">
        <NotebookColorControl
          :model-value="color"
          :presets="presets"
          :recents="recents"
          :quick-colors="quickColors"
          :show-quick="false"
          :label="t('notebook.tools.color')"
          @update:model-value="emit('update:color', $event)"
          @add-preset="emit('addPreset', $event)"
          @remove-preset="emit('removePreset', $event)"
        />
        <div class="notebook-width tw:flex tw:items-center tw:gap-1">
          <NvNumberInput :model-value="activeWidth" :min="widthRange.min" :max="widthRange.max" :step="widthRange.step" :aria-label="t('notebook.tools.width')" @update:model-value="updateWidth" />
          <span class="notebook-width__unit tw:text-[11px] tw:text-content-secondary" aria-hidden="true">pt</span>
        </div>
        <NvSelect class="notebook-toolbar__paper-select" :model-value="paper" :options="paperOptions" :aria-label="t('notebook.paper.label')" :min-width="96" @update:model-value="emit('update:paper', $event as NotebookPaperKind)" />
        <div v-if="tool === 'line'" class="notebook-dash tw:flex tw:items-center tw:gap-0.5" role="group" :aria-label="t('notebook.tools.lineStyle')">
          <NvButton
            v-for="option in dashOptions"
            :key="option.id"
            variant="ghost"
            icon
            :active="lineDash === option.id"
            :aria-label="option.label"
            :title="option.label"
            :aria-pressed="lineDash === option.id"
            @click="emit('update:lineDash', option.id)"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" stroke-width="2" stroke-linecap="round" :stroke-dasharray="option.pattern" />
            </svg>
          </NvButton>
        </div>
        <div v-if="tool === 'eraser'" class="notebook-eraser-mode tw:flex tw:items-center tw:gap-0.5" role="group" :aria-label="t('notebook.tools.eraserMode')">
          <NvButton
            v-for="option in eraserModes"
            :key="option.id"
            variant="ghost"
            icon
            :active="(eraserMode ?? 'partial') === option.id"
            :aria-label="option.label"
            :title="option.label"
            :aria-pressed="(eraserMode ?? 'partial') === option.id"
            @click="emit('update:eraserMode', option.id)"
          >
            <component :is="option.icon" :size="16" aria-hidden="true" />
          </NvButton>
        </div>
      </div>
    </div>

    <div class="notebook-toolbar__tools tw:col-2 tw:row-1 tw:flex tw:min-w-0 tw:flex-wrap tw:items-center tw:justify-center tw:gap-0.5 tw:justify-self-center" role="toolbar" :aria-label="t('notebook.tools.label')">
      <template v-for="item in tools" :key="item.id">
        <NotebookShapePicker v-if="item.id === 'move'" :tool="tool" @update:tool="emit('update:tool', $event)" />
        <NvButton
          variant="ghost"
          icon
          :active="tool === item.id"
          :aria-label="item.label"
          :title="item.label"
          :aria-pressed="tool === item.id"
          @click="emit('update:tool', item.id)"
        >
          <component :is="item.icon" :size="16" aria-hidden="true" />
        </NvButton>
      </template>
      <NvButton variant="ghost" icon :active="rulerOpen" :aria-label="t('notebook.ruler.label')" :title="t('notebook.ruler.label')" :aria-pressed="!!rulerOpen" @click="emit('toggleRuler')">
        <Ruler :size="16" aria-hidden="true" />
      </NvButton>
      <NvButton variant="ghost" icon :disabled="importing" :aria-label="t('notebook.tools.image')" :title="t('notebook.tools.image')" @click="emit('insertImage')">
        <ImagePlus :size="16" aria-hidden="true" />
      </NvButton>
    </div>

    <div class="notebook-toolbar__right tw:col-3 tw:row-1 tw:flex tw:min-w-0 tw:items-center tw:gap-2 tw:justify-self-end">
      <div class="notebook-toolbar__actions tw:flex tw:min-w-0 tw:items-center tw:gap-0.5">
        <NvButton variant="ghost" icon :disabled="!canUndo" :aria-label="t('notebook.undo')" @click="emit('undo')">
          <Undo2 :size="16" aria-hidden="true" />
        </NvButton>
        <NvButton variant="ghost" icon :disabled="!canRedo" :aria-label="t('notebook.redo')" @click="emit('redo')">
          <Redo2 :size="16" aria-hidden="true" />
        </NvButton>
        <span class="notebook-toolbar__separator notebook-toolbar__zoom-control tw:mx-1 tw:h-[18px] tw:w-px tw:bg-border-subtle" aria-hidden="true" />
        <NvButton class="notebook-toolbar__zoom-control" variant="ghost" icon :aria-label="t('notebook.zoomOut')" @click="emit('zoomOut')">
          <Minus :size="16" aria-hidden="true" />
        </NvButton>
        <span class="notebook-toolbar__zoom notebook-toolbar__zoom-control tw:min-w-[38px] tw:text-center tw:text-[11px] tw:text-content-secondary tw:tabular-nums" aria-live="polite">{{ Math.round(zoom * 100) }}%</span>
        <NvButton class="notebook-toolbar__zoom-control" variant="ghost" icon :aria-label="t('notebook.zoomIn')" @click="emit('zoomIn')">
          <Plus :size="16" aria-hidden="true" />
        </NvButton>
      </div>
      <NvButton class="notebook-toolbar__export" variant="primary" :loading="exporting" :aria-label="t('notebook.export')" @click="emit('export')">
        <Download :size="16" aria-hidden="true" />
        <span class="notebook-toolbar__export-label">{{ t('notebook.export') }}</span>
      </NvButton>
    </div>

    <span class="notebook-toolbar__save tw:pointer-events-none tw:absolute tw:right-4 tw:-bottom-[23px] tw:text-[11px] tw:text-content-muted" role="status" aria-live="polite">
      {{ error || t(`notebook.saveStatus.${saveStatus}`) }}
    </span>
  </header>
</template>

<style scoped>
/* Remaining CSS: :deep() overrides into child components, container-query/coarse-pointer/compact layout overrides that must beat the base utilities, ::after hit areas and scroll-mask rules. */
.notebook-toolbar :deep(.nv-btn) { min-width: 32px; min-height: 32px; height: 32px; font-size: 12px; }
.notebook-toolbar :deep(.nv-btn--icon) { width: 32px; padding: 0; }
.notebook-width :deep(.nni-root) { height: 32px; }
.notebook-width :deep(.nni-input) { width: 40px; }
.notebook-width :deep(.nni-step) { width: 24px; }
.notebook-toolbar__paper-select :deep(.nv-select__trigger) { min-height: 32px; height: 32px; padding-block: 0; padding-inline: 8px; font-size: 12px; }

@container notebook-editor (max-width: 1000px) {
  .notebook-toolbar__left, .notebook-toolbar__right { display: contents; }
  .notebook-toolbar__pages-toggle { grid-column: 1; grid-row: 1; justify-self: start; }
  .notebook-toolbar__export { grid-column: 3; grid-row: 1; justify-self: end; }
  .notebook-toolbar__style { grid-column: 1 / -1; grid-row: 2; justify-self: start; }
  .notebook-toolbar__actions { grid-column: 1 / -1; grid-row: 2; justify-self: end; }
  .notebook-toolbar__export-label { display: none; }
}

/* Two-row layout when the single row would overlap (measured by useNotebookToolbarLayout). */
.notebook-toolbar--compact .notebook-toolbar__left, .notebook-toolbar--compact .notebook-toolbar__right { display: contents; }
.notebook-toolbar--compact .notebook-toolbar__pages-toggle { grid-column: 1; grid-row: 1; justify-self: start; }
.notebook-toolbar--compact .notebook-toolbar__export { grid-column: 3; grid-row: 1; justify-self: end; }
.notebook-toolbar--compact .notebook-toolbar__style { grid-column: 1 / -1; grid-row: 2; justify-self: start; }
.notebook-toolbar--compact .notebook-toolbar__actions { grid-column: 1 / -1; grid-row: 2; justify-self: end; }
.notebook-toolbar--compact .notebook-toolbar__export-label { display: none; }

@media (pointer: coarse) {
  .notebook-toolbar :deep(.nv-btn) { min-width: 44px; min-height: 44px; height: 44px; }
  .notebook-toolbar :deep(.nv-btn--icon) { width: 44px; }
  .notebook-width :deep(.nni-root), .notebook-toolbar__paper-select :deep(.nv-select__trigger) { min-height: 44px; height: 44px; }
  .notebook-width :deep(.nni-step) { width: 44px; }

  @container notebook-editor (max-width: 1200px) {
    .notebook-toolbar__left, .notebook-toolbar__right { display: contents; }
    .notebook-toolbar__pages-toggle { grid-column: 1; grid-row: 1; justify-self: start; }
    .notebook-toolbar__export { grid-column: 3; grid-row: 1; justify-self: end; }
    .notebook-toolbar__style { grid-column: 1 / -1; grid-row: 2; justify-self: start; }
    .notebook-toolbar__actions { grid-column: 1 / -1; grid-row: 2; justify-self: end; }
    .notebook-toolbar__export-label { display: none; }
  }
}

/* Touch tablets: 36px controls instead of the 44px phone size, so the toolbar
   reads as a tool palette rather than a stack of big chips. Each button keeps a
   ~42x44px hit area through a transparent ::after, and the tool strip spacing
   (36px + 6px gap) keeps neighbouring hit areas from overlapping. */
@media (pointer: coarse) {
  @container notebook-editor (min-width: 561px) {
    .notebook-toolbar { min-height: 0; padding: 6px 12px; row-gap: 6px; }
    .notebook-toolbar :deep(.nv-btn) { position: relative; min-width: 36px; min-height: 36px; height: 36px; }
    .notebook-toolbar :deep(.nv-btn--icon) { width: 36px; }
    .notebook-toolbar :deep(.nv-btn)::after { content: ''; position: absolute; inset: -4px -3px; }
    .notebook-toolbar__tools, .notebook-toolbar__actions, .notebook-dash, .notebook-eraser-mode { gap: 6px; }
    .notebook-toolbar__style { gap: 8px; }
    .notebook-width :deep(.nni-root), .notebook-toolbar__paper-select :deep(.nv-select__trigger) { min-height: 36px; height: 36px; }
    .notebook-width :deep(.nni-step) { width: 36px; }
    .notebook-toolbar .notebook-toolbar__style :deep(.nv-color-picker__trigger--swatch) { width: 36px; height: 36px; }
    .notebook-toolbar .notebook-toolbar__style :deep(.notebook-color-control__quick-swatch) { width: 28px; height: 28px; }
  }
}

/* Phone width: two rows instead of four or five. Row 1 holds the pages toggle, a
   horizontally scrolling tool strip and export; row 2 the pen style (scrolling
   when the line or eraser options add buttons) with undo/redo pinned right.
   Declared last so it overrides the wider and coarse-pointer layouts above. */
@container notebook-editor (max-width: 560px) {
  .notebook-toolbar, .notebook-toolbar--compact { grid-template-columns: auto minmax(0, 1fr) auto; row-gap: 4px; }
  .notebook-toolbar__left, .notebook-toolbar__right { display: contents; }
  .notebook-toolbar__pages-toggle { grid-column: 1; grid-row: 1; justify-self: start; }
  .notebook-toolbar__export, .notebook-toolbar--compact .notebook-toolbar__export { grid-column: 3; grid-row: 1; justify-self: end; }
  .notebook-toolbar__export-label { display: none; }
  .notebook-toolbar__tools,
  .notebook-toolbar__style,
  .notebook-toolbar--compact .notebook-toolbar__style {
    flex-wrap: nowrap;
    justify-content: flex-start;
    justify-self: stretch;
    /* Room for focus rings, which a scroll container would otherwise clip. */
    margin: -3px;
    padding: 3px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }
  .notebook-toolbar__tools::-webkit-scrollbar,
  .notebook-toolbar__style::-webkit-scrollbar { display: none; }
  .notebook-toolbar__tools > *, .notebook-toolbar__style > * { flex: none; }
  /* Fade the trailing edge so a cut-off row reads as scrollable; the end padding
     lets the last control scroll clear of the fade. */
  .notebook-toolbar__tools,
  .notebook-toolbar__style,
  .notebook-toolbar--compact .notebook-toolbar__style {
    padding-inline-end: 28px;
    -webkit-mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
    mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent);
  }
  .notebook-toolbar__tools { grid-column: 2; grid-row: 1; width: auto; }
  .notebook-toolbar__style, .notebook-toolbar--compact .notebook-toolbar__style { grid-column: 1 / 3; grid-row: 2; }
  .notebook-toolbar__actions, .notebook-toolbar--compact .notebook-toolbar__actions { grid-column: 3; grid-row: 2; justify-self: end; }
  .notebook-toolbar :deep(.notebook-color-control__quick) { display: none; }
  .notebook-width__unit { display: none; }
}

/* Touch phones zoom with a pinch (useNotebookInteraction), so the zoom buttons go. */
@media (pointer: coarse) {
  @container notebook-editor (max-width: 560px) {
    .notebook-toolbar__zoom-control { display: none; }
  }
}
</style>
