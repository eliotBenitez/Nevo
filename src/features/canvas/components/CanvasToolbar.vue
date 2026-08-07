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
  <div class="canvas-toolbar" role="toolbar" :aria-label="labels.toolbar">
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
      :class="{ 'is-active': activeTool === item.tool }"
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
      :class="{ 'is-active': activeTool === item.tool }"
      :title="labels[item.tool]"
      :aria-label="labels[item.tool]"
      :aria-pressed="activeTool === item.tool"
      @click="$emit('tool', item.tool)"
    >
      <component :is="item.icon" :size="17" />
    </button>
    <span class="canvas-toolbar__separator" aria-hidden="true" />
    <button type="button" :title="labels.undo" :aria-label="labels.undo" @click="$emit('undo')">
      <Undo2 :size="17" />
    </button>
    <button type="button" :title="labels.redo" :aria-label="labels.redo" @click="$emit('redo')">
      <Redo2 :size="17" />
    </button>
    <span class="canvas-toolbar__separator" aria-hidden="true" />
    <button type="button" :title="labels.zoomOut" :aria-label="labels.zoomOut" @click="$emit('zoom-out')">
      <Minus :size="17" />
    </button>
    <output class="canvas-toolbar__zoom">{{ Math.round(zoom * 100) }}%</output>
    <button type="button" :title="labels.zoomIn" :aria-label="labels.zoomIn" @click="$emit('zoom-in')">
      <Plus :size="17" />
    </button>
    <button type="button" :title="labels.fit" :aria-label="labels.fit" @click="$emit('fit')">
      <Focus :size="17" />
    </button>
    <span class="canvas-toolbar__separator" aria-hidden="true" />
    <button type="button" :title="labels.fullscreen" :aria-label="labels.fullscreen" @click="$emit('fullscreen')">
      <Maximize2 :size="17" />
    </button>
    <button type="button" :title="labels.present" :aria-label="labels.present" :disabled="!canPresent" @click="$emit('present')">
      <Presentation :size="17" />
    </button>
    <button type="button" :title="labels.export" :aria-label="labels.export" @click="$emit('export')">
      <Download :size="17" />
    </button>
  </div>
</template>

<style scoped>
.canvas-toolbar {
  position: absolute;
  z-index: 30;
  top: 16px;
  left: 50%;
  display: flex;
  max-width: calc(100% - 32px);
  align-items: center;
  gap: 2px;
  min-height: 44px;
  padding: 5px;
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: color-mix(in srgb, var(--canvas-1) 88%, transparent);
  box-shadow: var(--shadow-2);
  backdrop-filter: blur(18px);
  transform: translateX(-50%);
  scrollbar-width: none;
}

:deep(button) {
  display: grid;
  width: 34px;
  min-width: 34px;
  height: 34px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 9px;
  color: var(--text-secondary);
  background: transparent;
}

:deep(button:hover),
:deep(button.is-active) {
  color: var(--text-primary);
  background: color-mix(in srgb, var(--text-secondary) 12%, transparent);
}

:deep(button.is-active) {
  color: var(--accent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent);
}

:deep(button:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

:deep(button:disabled) {
  opacity: 0.4;
  cursor: not-allowed;
}

.canvas-toolbar__separator {
  width: 1px;
  min-width: 1px;
  height: 22px;
  margin: 0 2px;
  background: var(--border-subtle);
}

.canvas-toolbar__zoom {
  min-width: 48px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 760px) {
  .canvas-toolbar {
    top: auto;
    right: calc(12px + max(var(--safe-area-right), 0px));
    bottom: calc(16px + max(var(--safe-area-bottom), 0px));
    left: calc(12px + max(var(--safe-area-left), 0px));
    max-width: none;
    min-height: 56px;
    padding: 6px;
    border-radius: 18px;
    background: color-mix(in srgb, var(--canvas-1) 90%, transparent);
    box-shadow: 0 18px 44px -18px var(--shadow);
    transform: none;
    scroll-snap-type: x proximity;
  }

  :deep(button) {
    width: 44px;
    min-width: 44px;
    height: 44px;
    scroll-snap-align: center;
  }
}
</style>
