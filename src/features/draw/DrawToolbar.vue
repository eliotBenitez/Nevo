<script setup lang="ts">
import { Pencil, Eraser, Square, Minus, ArrowUpRight, Circle, Undo2, Redo2, Trash2 } from 'lucide-vue-next'
import type { DrawTool } from '../../utils/draw/drawEngine'
import type { DrawEditorTool } from './useDrawEditor'

defineProps<{
  tool: DrawEditorTool
  color: string
  size: number
  palette: string[]
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  'update:tool': [tool: DrawEditorTool]
  'update:color': [color: string]
  'update:size': [size: number]
  undo: []
  redo: []
  clear: []
}>()

const tools: { id: DrawEditorTool; icon: typeof Pencil; label: string }[] = [
  { id: 'freehand', icon: Pencil, label: 'Pencil' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Arrow' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
]

// Re-export the stroke-tool subset for callers that need it.
export type { DrawTool }

const sizes = [2, 4, 8, 14]
</script>

<template>
  <div class="draw-toolbar" role="toolbar" aria-label="Drawing tools">
    <div class="draw-toolbar__group">
      <button
        v-for="t in tools"
        :key="t.id"
        type="button"
        class="draw-toolbar__btn"
        :class="{ 'is-active': tool === t.id }"
        :title="t.label"
        :aria-pressed="tool === t.id"
        @click="emit('update:tool', t.id)"
      >
        <component :is="t.icon" :size="16" />
      </button>
    </div>

    <div class="draw-toolbar__divider" />

    <div class="draw-toolbar__group">
      <button
        v-for="c in palette"
        :key="c"
        type="button"
        class="draw-toolbar__swatch"
        :class="{ 'is-active': color === c }"
        :style="{ backgroundColor: c }"
        :title="c"
        :aria-label="`Color ${c}`"
        @click="emit('update:color', c)"
      />
    </div>

    <div class="draw-toolbar__divider" />

    <div class="draw-toolbar__group">
      <button
        v-for="s in sizes"
        :key="s"
        type="button"
        class="draw-toolbar__size"
        :class="{ 'is-active': size === s }"
        :title="`${s}px`"
        @click="emit('update:size', s)"
      >
        <span class="draw-toolbar__size-dot" :style="{ width: `${s + 2}px`, height: `${s + 2}px` }" />
      </button>
    </div>

    <div class="draw-toolbar__divider" />

    <div class="draw-toolbar__group">
      <button type="button" class="draw-toolbar__btn" :disabled="!canUndo" title="Undo" @click="emit('undo')">
        <Undo2 :size="16" />
      </button>
      <button type="button" class="draw-toolbar__btn" :disabled="!canRedo" title="Redo" @click="emit('redo')">
        <Redo2 :size="16" />
      </button>
      <button type="button" class="draw-toolbar__btn draw-toolbar__btn--danger" title="Clear canvas" @click="emit('clear')">
        <Trash2 :size="16" />
      </button>
    </div>
  </div>
</template>
