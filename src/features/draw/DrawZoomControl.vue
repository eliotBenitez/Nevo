<script setup lang="ts">
import { Minus, Plus, Maximize } from '@lucide/vue'

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
  <div class="draw-toolbar__divider tw:w-px tw:self-stretch tw:bg-(--border-subtle) tw:mx-0.5 tw:max-[719px]:flex-[0_0_1px]" />
  <div class="draw-zoom tw:inline-flex tw:items-center tw:gap-0.5" role="group" aria-label="Zoom">
    <button
      type="button"
      class="draw-zoom__btn tw:inline-flex tw:items-center tw:justify-center tw:size-[30px] tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary tw:max-[719px]:size-11 tw:max-[719px]:min-w-11 tw:max-[719px]:rounded-xl tw:max-[719px]:[scroll-snap-align:center]"
      title="Zoom out"
      @click="emit('zoom-out')"
    >
      <Minus :size="16" />
    </button>
    <span class="draw-zoom__label tw:min-w-[42px] tw:text-center tw:text-xs tw:[font-variant-numeric:tabular-nums] tw:text-content-secondary tw:select-none">{{ zoomPercent }}</span>
    <button
      type="button"
      class="draw-zoom__btn tw:inline-flex tw:items-center tw:justify-center tw:size-[30px] tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary tw:max-[719px]:size-11 tw:max-[719px]:min-w-11 tw:max-[719px]:rounded-xl tw:max-[719px]:[scroll-snap-align:center]"
      title="Zoom in"
      @click="emit('zoom-in')"
    >
      <Plus :size="16" />
    </button>
    <button
      type="button"
      class="draw-zoom__btn tw:inline-flex tw:items-center tw:justify-center tw:size-[30px] tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary tw:max-[719px]:size-11 tw:max-[719px]:min-w-11 tw:max-[719px]:rounded-xl tw:max-[719px]:[scroll-snap-align:center]"
      title="Fit to content"
      @click="emit('fit')"
    >
      <Maximize :size="15" />
    </button>
  </div>
</template>
