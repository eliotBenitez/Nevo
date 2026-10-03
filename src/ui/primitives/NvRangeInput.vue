<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  modelValue: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  ariaLabel?: string
  showValue?: boolean
  valueSuffix?: string
}

const props = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 100,
  step: 1,
  disabled: false,
  ariaLabel: undefined,
  showValue: false,
  valueSuffix: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

const displayValue = computed(() => `${props.modelValue}${props.valueSuffix}`)

function clamp(value: number): number {
  return Math.min(props.max, Math.max(props.min, value))
}

function onInput(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  if (Number.isFinite(value)) {
    emit('update:modelValue', clamp(value))
  }
}
</script>

<template>
  <span
    class="nv-range-input tw:inline-grid tw:w-full tw:items-center"
    :class="showValue && 'nv-range-input--with-value tw:grid-cols-[minmax(56px,1fr)_minmax(30px,auto)] tw:gap-[7px]'"
  >
    <input
      type="range"
      class="nv-range-input__control tw:m-0 tw:h-7 tw:w-full tw:accent-accent tw:cursor-pointer tw:disabled:cursor-not-allowed tw:disabled:opacity-[0.48]"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-valuetext="showValue ? displayValue : undefined"
      @input="onInput"
    >
    <output v-if="showValue" class="nv-range-input__value tw:text-right tw:font-nv-ui tw:text-[11px] tw:leading-none tw:font-medium tw:tabular-nums tw:text-content-muted">{{ displayValue }}</output>
  </span>
</template>

<style scoped>
.nv-range-input__control:focus-visible {
  border-radius: calc(6px * var(--radius-scale, 1));
  outline: none;
  box-shadow: 0 0 0 2px var(--focus-ring);
}
</style>
