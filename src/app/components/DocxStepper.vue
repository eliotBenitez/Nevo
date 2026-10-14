<script setup lang="ts">
import { Minus, Plus } from '@lucide/vue'

defineProps<{
  label: string
  value: string
  canDecrement: boolean
  canIncrement: boolean
}>()

const emit = defineEmits<{ decrement: []; increment: [] }>()
</script>

<template>
  <div class="docx-field docx-field--row tw:flex tw:items-center tw:justify-between tw:gap-2.5">
    <span class="docx-field__label tw:min-w-0 tw:text-[11px] tw:text-content-muted">{{ label }}</span>
    <div class="docx-stepper tw:inline-flex tw:shrink-0 tw:items-center tw:overflow-hidden tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--hover)">
      <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :aria-label="`${label} −`" :disabled="!canDecrement" @click="emit('decrement')">
        <Minus :size="12" />
      </button>
      <span class="docx-stepper__value tw:inline-flex tw:h-[26px] tw:min-w-[54px] tw:items-center tw:justify-center tw:border-x tw:border-y-0 tw:border-solid tw:border-x-(--border-subtle) tw:px-1 tw:font-nv-mono tw:text-[11.5px] tw:font-medium tw:whitespace-nowrap tw:text-content-secondary">{{ value }}</span>
      <button type="button" class="docx-stepper__btn tw:grid tw:h-[26px] tw:w-7 tw:cursor-pointer tw:place-items-center tw:border-0 tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:disabled:cursor-default tw:disabled:opacity-35" :aria-label="`${label} +`" :disabled="!canIncrement" @click="emit('increment')">
        <Plus :size="12" />
      </button>
    </div>
  </div>
</template>
