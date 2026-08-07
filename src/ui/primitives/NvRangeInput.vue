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
  <span class="nv-range-input" :class="{ 'nv-range-input--with-value': showValue }">
    <input
      type="range"
      class="nv-range-input__control"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-label="ariaLabel"
      :aria-valuetext="showValue ? displayValue : undefined"
      @input="onInput"
    >
    <output v-if="showValue" class="nv-range-input__value">{{ displayValue }}</output>
  </span>
</template>

<style scoped>
.nv-range-input {
  display: inline-grid;
  align-items: center;
  width: 100%;
}

.nv-range-input--with-value {
  grid-template-columns: minmax(56px, 1fr) minmax(30px, auto);
  gap: 7px;
}

.nv-range-input__control {
  width: 100%;
  height: 28px;
  margin: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.nv-range-input__control:focus-visible {
  border-radius: calc(5px * var(--radius-scale, 1));
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.nv-range-input__control:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}

.nv-range-input__value {
  color: var(--text-3);
  font: 500 11px/1 var(--font-ui);
  text-align: right;
  font-variant-numeric: tabular-nums;
}
</style>
