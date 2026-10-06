<script setup lang="ts">
import { MousePointer2, Pencil, Highlighter, Eraser, Square, Minus, ArrowUpRight, Circle, Diamond, Type, Undo2, Redo2, Trash2, Hand } from '@lucide/vue'
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
  <div
    class="draw-toolbar tw:absolute tw:left-1/2 tw:bottom-5 tw:z-6 tw:flex tw:items-center tw:gap-2.5 tw:flex-wrap tw:justify-center tw:max-w-[calc(100%-32px)] tw:py-2 tw:px-3.5 tw:border tw:border-solid tw:border-transparent tw:rounded-[14px] tw:bg-(--menu-bg) tw:shadow-(--shadow-overlay) tw:-translate-x-1/2 tw:max-[719px]:right-[calc(12px+max(var(--safe-area-right),0px))] tw:max-[719px]:bottom-[calc(16px+max(var(--safe-area-bottom),0px))] tw:max-[719px]:left-[calc(12px+max(var(--safe-area-left),0px))] tw:max-[719px]:max-w-none tw:max-[719px]:min-h-14 tw:max-[719px]:flex-nowrap tw:max-[719px]:justify-start tw:max-[719px]:gap-1 tw:max-[719px]:p-1.5 tw:max-[719px]:overflow-x-auto tw:max-[719px]:overflow-y-hidden tw:max-[719px]:rounded-[18px] tw:max-[719px]:translate-x-0 tw:max-[719px]:[scroll-snap-type:x_proximity] tw:max-[719px]:[scrollbar-width:none] tw:max-[719px]:[&::-webkit-scrollbar]:hidden"
    role="toolbar"
    aria-label="Drawing tools"
  >
    <div class="draw-toolbar__group tw:flex tw:items-center tw:gap-1 tw:max-[719px]:flex-[0_0_auto]">
      <button
        v-for="t in tools"
        :key="t.id"
        type="button"
        class="draw-toolbar__btn tw:relative tw:inline-flex tw:items-center tw:justify-center tw:size-[30px] tw:border tw:border-solid tw:rounded-md tw:transition-colors tw:duration-100 tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[719px]:size-11 tw:max-[719px]:min-w-11 tw:max-[719px]:rounded-xl tw:max-[719px]:[scroll-snap-align:center]"
        :class="tool === t.id
          ? 'is-active tw:bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] tw:text-accent tw:border-[color-mix(in_oklab,var(--accent)_40%,transparent)]'
          : 'tw:bg-transparent tw:text-content-secondary tw:border-transparent tw:hover:bg-(--hover-strong)'"
        :title="t.shortcut ? `${t.label} (${t.shortcut})` : t.label"
        :aria-pressed="tool === t.id"
        @click="emit('update:tool', t.id)"
      >
        <component :is="t.icon" :size="16" />
        <span
          v-if="t.shortcut"
          class="draw-toolbar__shortcut tw:absolute tw:bottom-px tw:right-0.5 tw:text-[8px] tw:font-medium tw:pointer-events-none tw:leading-none"
          :class="tool === t.id ? 'tw:text-accent tw:opacity-80' : 'tw:text-content-muted'"
        >{{ t.shortcut }}</span>
      </button>
    </div>

    <div class="draw-toolbar__divider tw:w-px tw:self-stretch tw:bg-(--border-subtle) tw:mx-0.5 tw:max-[719px]:flex-[0_0_1px]" />

    <div class="draw-toolbar__group tw:flex tw:items-center tw:gap-1 tw:max-[719px]:flex-[0_0_auto]">
      <button
        type="button"
        class="draw-toolbar__btn tw:relative tw:inline-flex tw:items-center tw:justify-center tw:size-[30px] tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[719px]:size-11 tw:max-[719px]:min-w-11 tw:max-[719px]:rounded-xl tw:max-[719px]:[scroll-snap-align:center]"
        :disabled="!canUndo"
        title="Undo"
        @click="emit('undo')"
      >
        <Undo2 :size="16" />
      </button>
      <button
        type="button"
        class="draw-toolbar__btn tw:relative tw:inline-flex tw:items-center tw:justify-center tw:size-[30px] tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:disabled:opacity-40 tw:disabled:cursor-not-allowed tw:max-[719px]:size-11 tw:max-[719px]:min-w-11 tw:max-[719px]:rounded-xl tw:max-[719px]:[scroll-snap-align:center]"
        :disabled="!canRedo"
        title="Redo"
        @click="emit('redo')"
      >
        <Redo2 :size="16" />
      </button>
      <button
        type="button"
        class="draw-toolbar__btn draw-toolbar__btn--danger tw:relative tw:inline-flex tw:items-center tw:justify-center tw:size-[30px] tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-danger tw:max-[719px]:size-11 tw:max-[719px]:min-w-11 tw:max-[719px]:rounded-xl tw:max-[719px]:[scroll-snap-align:center]"
        title="Clear canvas"
        @click="emit('clear')"
      >
        <Trash2 :size="16" />
      </button>
    </div>

    <slot name="tools-trailing" />
  </div>
</template>
