<script setup lang="ts">
import { Minus, Plus, Maximize } from 'lucide-vue-next'

defineProps<{
  zoomPercent: string
}>()

const emit = defineEmits<{
  'zoom-out': []
  'zoom-in': []
  'fit': []
}>()
</script>

<template>
  <div class="draw-toolbar__divider" />
  <div class="draw-zoom" role="group" aria-label="Zoom">
    <button type="button" class="draw-zoom__btn" title="Zoom out" @click="emit('zoom-out')">
      <Minus :size="16" />
    </button>
    <span class="draw-zoom__label">{{ zoomPercent }}</span>
    <button type="button" class="draw-zoom__btn" title="Zoom in" @click="emit('zoom-in')">
      <Plus :size="16" />
    </button>
    <button type="button" class="draw-zoom__btn" title="Fit to content" @click="emit('fit')">
      <Maximize :size="15" />
    </button>
  </div>
</template>
