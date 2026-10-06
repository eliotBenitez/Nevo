<script setup lang="ts">
import { Circle, Diamond, Square } from '@lucide/vue'
import type { CanvasTool } from '../composables/useCanvasToolState'

defineProps<{
  activeTool: CanvasTool
  labels: Record<'rectangle' | 'ellipse' | 'diamond', string>
}>()

defineEmits<{ select: [tool: 'rectangle' | 'ellipse' | 'diamond'] }>()
</script>

<template>
  <div class="canvas-shape-menu tw:flex tw:gap-0.5" role="group">
    <button
      v-for="item in [
        { tool: 'rectangle', icon: Square },
        { tool: 'ellipse', icon: Circle },
        { tool: 'diamond', icon: Diamond },
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
      @click="$emit('select', item.tool)"
    >
      <component :is="item.icon" :size="17" />
    </button>
  </div>
</template>
