<script setup lang="ts">
import {
  Download,
  Eraser,
  Focus,
  Hand,
  Highlighter,
  ImagePlus,
  Frame,
  Link2,
  Maximize2,
  Minus,
  MousePointer2,
  Pencil,
  Presentation,
  Plus,
  Redo2,
  Spline,
  StickyNote,
  Type,
  Undo2,
  Workflow,
} from 'lucide-vue-next'
import CanvasShapeMenu from './CanvasShapeMenu.vue'
import type { CanvasTool } from '../composables/useCanvasToolState'

defineProps<{
  zoom: number
  activeTool: CanvasTool
  labels: Record<string, string>
  canPresent: boolean
}>()

defineEmits<{
  tool: [tool: CanvasTool]
  'zoom-in': []
  'zoom-out': []
  fit: []
  undo: []
  redo: []
  export: []
  fullscreen: []
  present: []
}>()
</script>

<template>
  <div
    class="canvas-toolbar tw:absolute tw:z-30 tw:top-4 tw:left-1/2 tw:flex tw:max-w-[calc(100%-32px)] tw:items-center tw:gap-0.5 tw:min-h-11 tw:p-[5px] tw:overflow-x-auto tw:rounded-[14px] tw:border tw:border-solid tw:border-(--border-subtle) tw:bg-[color-mix(in_srgb,var(--surface-canvas)_88%,transparent)] tw:shadow-(--shadow-raised) tw:-translate-x-1/2 tw:[scrollbar-width:none] tw:max-[760px]:top-auto tw:max-[760px]:right-[calc(12px+max(var(--safe-area-right),0px))] tw:max-[760px]:bottom-[calc(16px+max(var(--safe-area-bottom),0px))] tw:max-[760px]:left-[calc(12px+max(var(--safe-area-left),0px))] tw:max-[760px]:max-w-none tw:max-[760px]:min-h-14 tw:max-[760px]:p-1.5 tw:max-[760px]:rounded-[18px] tw:max-[760px]:bg-[color-mix(in_srgb,var(--surface-canvas)_90%,transparent)] tw:max-[760px]:shadow-[0_18px_44px_-18px_var(--shadow)] tw:max-[760px]:translate-x-0 tw:max-[760px]:[scroll-snap-type:x_proximity]"
    role="toolbar"
    :aria-label="labels.toolbar"
  >
    <button
      v-for="item in [
        { tool: 'select', icon: MousePointer2 },
        { tool: 'hand', icon: Hand },
        { tool: 'text', icon: Type },
        { tool: 'note', icon: StickyNote },
        { tool: 'note-link', icon: Link2 },
        { tool: 'frame', icon: Frame },
        { tool: 'mindmap', icon: Workflow },
      ] as const"
      :key="item.tool"
      type="button"
      class="tw:grid tw:size-[34px] tw:min-w-[34px] tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[9px] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[760px]:size-11 tw:max-[760px]:min-w-11 tw:max-[760px]:[scroll-snap-align:center]"
      :class="activeTool === item.tool
        ? 'is-active tw:text-accent tw:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)] tw:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_30%,transparent)]'
        : 'tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)]'"
      :title="labels[item.tool]"
      :aria-label="labels[item.tool]"
      :aria-pressed="activeTool === item.tool"
      @click="$emit('tool', item.tool)"
    >
      <component :is="item.icon" :size="17" />
    </button>
    <CanvasShapeMenu
      :active-tool="activeTool"
      :labels="{ rectangle: labels.rectangle, ellipse: labels.ellipse, diamond: labels.diamond }"
      @select="$emit('tool', $event)"
    />
    <button
      v-for="item in [
        { tool: 'connector', icon: Spline },
        { tool: 'pen', icon: Pencil },
        { tool: 'highlighter', icon: Highlighter },
        { tool: 'eraser', icon: Eraser },
        { tool: 'image', icon: ImagePlus },
      ] as const"
      :key="item.tool"
      type="button"
      class="tw:grid tw:size-[34px] tw:min-w-[34px] tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[9px] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[760px]:size-11 tw:max-[760px]:min-w-11 tw:max-[760px]:[scroll-snap-align:center]"
      :class="activeTool === item.tool
        ? 'is-active tw:text-accent tw:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)] tw:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--accent)_30%,transparent)]'
        : 'tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)]'"
      :title="labels[item.tool]"
      :aria-label="labels[item.tool]"
      :aria-pressed="activeTool === item.tool"
      @click="$emit('tool', item.tool)"
    >
      <component :is="item.icon" :size="17" />
    </button>
    <span class="canvas-toolbar__separator tw:h-[22px] tw:w-px tw:min-w-px tw:mx-0.5 tw:bg-(--border-subtle)" aria-hidden="true" />
    <button
      type="button"
      class="tw:grid tw:size-[34px] tw:min-w-[34px] tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[9px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[760px]:size-11 tw:max-[760px]:min-w-11 tw:max-[760px]:[scroll-snap-align:center]"
      :title="labels.undo"
      :aria-label="labels.undo"
      @click="$emit('undo')"
    >
      <Undo2 :size="17" />
    </button>
    <button
      type="button"
      class="tw:grid tw:size-[34px] tw:min-w-[34px] tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[9px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[760px]:size-11 tw:max-[760px]:min-w-11 tw:max-[760px]:[scroll-snap-align:center]"
      :title="labels.redo"
      :aria-label="labels.redo"
      @click="$emit('redo')"
    >
      <Redo2 :size="17" />
    </button>
    <span class="canvas-toolbar__separator tw:h-[22px] tw:w-px tw:min-w-px tw:mx-0.5 tw:bg-(--border-subtle)" aria-hidden="true" />
    <button
      type="button"
      class="tw:grid tw:size-[34px] tw:min-w-[34px] tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[9px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[760px]:size-11 tw:max-[760px]:min-w-11 tw:max-[760px]:[scroll-snap-align:center]"
      :title="labels.zoomOut"
      :aria-label="labels.zoomOut"
      @click="$emit('zoom-out')"
    >
      <Minus :size="17" />
    </button>
    <output class="canvas-toolbar__zoom tw:min-w-12 tw:text-content-secondary tw:text-xs tw:text-center">{{ Math.round(zoom * 100) }}%</output>
    <button
      type="button"
      class="tw:grid tw:size-[34px] tw:min-w-[34px] tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[9px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[760px]:size-11 tw:max-[760px]:min-w-11 tw:max-[760px]:[scroll-snap-align:center]"
      :title="labels.zoomIn"
      :aria-label="labels.zoomIn"
      @click="$emit('zoom-in')"
    >
      <Plus :size="17" />
    </button>
    <button
      type="button"
      class="tw:grid tw:size-[34px] tw:min-w-[34px] tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[9px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[760px]:size-11 tw:max-[760px]:min-w-11 tw:max-[760px]:[scroll-snap-align:center]"
      :title="labels.fit"
      :aria-label="labels.fit"
      @click="$emit('fit')"
    >
      <Focus :size="17" />
    </button>
    <span class="canvas-toolbar__separator tw:h-[22px] tw:w-px tw:min-w-px tw:mx-0.5 tw:bg-(--border-subtle)" aria-hidden="true" />
    <button
      type="button"
      class="tw:grid tw:size-[34px] tw:min-w-[34px] tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[9px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[760px]:size-11 tw:max-[760px]:min-w-11 tw:max-[760px]:[scroll-snap-align:center]"
      :title="labels.fullscreen"
      :aria-label="labels.fullscreen"
      @click="$emit('fullscreen')"
    >
      <Maximize2 :size="17" />
    </button>
    <button
      type="button"
      data-hint="canvasPresent"
      class="tw:grid tw:size-[34px] tw:min-w-[34px] tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[9px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[760px]:size-11 tw:max-[760px]:min-w-11 tw:max-[760px]:[scroll-snap-align:center]"
      :title="labels.present"
      :aria-label="labels.present"
      :disabled="!canPresent"
      @click="$emit('present')"
    >
      <Presentation :size="17" />
    </button>
    <button
      type="button"
      class="tw:grid tw:size-[34px] tw:min-w-[34px] tw:place-items-center tw:p-0 tw:border-0 tw:rounded-[9px] tw:text-content-secondary tw:bg-transparent tw:hover:text-content-primary tw:hover:bg-[color-mix(in_srgb,var(--text-secondary)_12%,transparent)] tw:focus-visible:outline-2 tw:focus-visible:outline-offset-2 tw:focus-visible:outline-accent tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[760px]:size-11 tw:max-[760px]:min-w-11 tw:max-[760px]:[scroll-snap-align:center]"
      :title="labels.export"
      :aria-label="labels.export"
      @click="$emit('export')"
    >
      <Download :size="17" />
    </button>
  </div>
</template>
