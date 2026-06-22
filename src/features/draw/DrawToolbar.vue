<script setup lang="ts">
import { MousePointer2, Pencil, Highlighter, Eraser, Square, Minus, ArrowUpRight, Circle, Diamond, Type, Undo2, Redo2, Trash2, Hand } from 'lucide-vue-next'
import type { DrawTool } from '../../utils/draw/drawEngine'
import type { DrawEditorTool } from './useDrawEditor'

defineProps<{
  tool: DrawEditorTool
  canUndo: boolean
  canRedo: boolean
}>()

const emit = defineEmits<{
  'update:tool': [tool: DrawEditorTool]
  undo: []
  redo: []
  clear: []
}>()

const tools: { id: DrawEditorTool; icon: typeof Pencil; label: string; shortcut?: string }[] = [
  { id: 'select', icon: MousePointer2, label: 'Select', shortcut: '1' },
  { id: 'freehand', icon: Pencil, label: 'Pencil', shortcut: '2' },
  { id: 'highlighter', icon: Highlighter, label: 'Highlighter', shortcut: '3' },
  { id: 'rectangle', icon: Square, label: 'Rectangle', shortcut: '4' },
  { id: 'line', icon: Minus, label: 'Line', shortcut: '5' },
  { id: 'arrow', icon: ArrowUpRight, label: 'Arrow', shortcut: '6' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse', shortcut: '7' },
  { id: 'diamond', icon: Diamond, label: 'Diamond', shortcut: '8' },
  { id: 'text', icon: Type, label: 'Text', shortcut: '9' },
  { id: 'hand', icon: Hand, label: 'Pan', shortcut: 'H' },
  { id: 'eraser', icon: Eraser, label: 'Eraser', shortcut: '0' },
]

export type { DrawTool }
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
        :title="t.shortcut ? `${t.label} (${t.shortcut})` : t.label"
        :aria-pressed="tool === t.id"
        @click="emit('update:tool', t.id)"
      >
        <component :is="t.icon" :size="16" />
        <span v-if="t.shortcut" class="draw-toolbar__shortcut">{{ t.shortcut }}</span>
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

    <slot name="tools-trailing" />
  </div>
</template>
