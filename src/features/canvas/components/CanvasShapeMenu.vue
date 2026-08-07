<script setup lang="ts">
import { Circle, Diamond, Square } from 'lucide-vue-next'
import type { CanvasTool } from '../composables/useCanvasToolState'

defineProps<{
  activeTool: CanvasTool
  labels: Record<'rectangle' | 'ellipse' | 'diamond', string>
}>()

defineEmits<{ select: [tool: 'rectangle' | 'ellipse' | 'diamond'] }>()
</script>

<template>
  <div class="canvas-shape-menu" role="group">
    <button
      v-for="item in [
        { tool: 'rectangle', icon: Square },
        { tool: 'ellipse', icon: Circle },
        { tool: 'diamond', icon: Diamond },
      ] as const"
      :key="item.tool"
      type="button"
      :class="{ 'is-active': activeTool === item.tool }"
      :title="labels[item.tool]"
      :aria-label="labels[item.tool]"
      :aria-pressed="activeTool === item.tool"
      @click="$emit('select', item.tool)"
    >
      <component :is="item.icon" :size="17" />
    </button>
  </div>
</template>

<style scoped>
.canvas-shape-menu {
  display: flex;
  gap: 2px;
}
</style>
