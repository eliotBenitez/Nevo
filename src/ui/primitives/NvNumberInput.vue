<script setup lang="ts">
import { computed } from 'vue'
import { Minus, Plus } from 'lucide-vue-next'

interface Props {
  modelValue: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  placeholder?: string
  size?: 'sm' | 'md'
  allowEmpty?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  step: 1,
  disabled: false,
  placeholder: '0',
  size: 'sm',
  min: undefined,
  max: undefined,
  allowEmpty: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const currentValue = computed(() => Number.isFinite(props.modelValue) ? props.modelValue : 0)

const canDecrement = computed(
  () => !props.disabled && (props.min === undefined || currentValue.value > props.min),
)

const canIncrement = computed(
  () => !props.disabled && (props.max === undefined || currentValue.value < props.max),
)

function clamp(value: number): number {
  let v = value
  if (props.min !== undefined) v = Math.max(props.min, v)
  if (props.max !== undefined) v = Math.min(props.max, v)
  return v
}

function decrement() {
  if (!canDecrement.value) return
  emit('update:modelValue', clamp(currentValue.value - props.step))
}

function increment() {
  if (!canIncrement.value) return
  emit('update:modelValue', clamp(currentValue.value + props.step))
}

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  if (raw === '') {
    if (props.allowEmpty) emit('update:modelValue', Number.NaN)
    return
  }
  const parsed = parseFloat(raw)
  if (!isNaN(parsed)) emit('update:modelValue', clamp(parsed))
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowUp') { event.preventDefault(); increment() }
  if (event.key === 'ArrowDown') { event.preventDefault(); decrement() }
}
</script>

<template>
  <div
    class="nni-root"
    :class="[`nni-root--${size}`, disabled && 'nni-root--disabled']"
  >
    <button
      type="button"
      class="nni-step"
      :disabled="disabled || !canDecrement"
      tabindex="-1"
      @click="decrement"
    >
      <Minus :size="10" />
    </button>

    <input
      type="number"
      class="nni-input"
      :value="allowEmpty && !Number.isFinite(modelValue) ? '' : modelValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :placeholder="placeholder"
      @input="onInput"
      @keydown="onKeydown"
    />

    <button
      type="button"
      class="nni-step"
      :disabled="disabled || !canIncrement"
      tabindex="-1"
      @click="increment"
    >
      <Plus :size="10" />
    </button>
  </div>
</template>

<style scoped>
.nni-root {
  display: inline-flex;
  align-items: center;
  border-radius: calc(7px * var(--radius-scale, 1));
  border: 1px solid var(--line-2);
  background: var(--glass-3, var(--surface-1));
  transition: border-color 0.12s, box-shadow 0.12s;
  overflow: hidden;
}

.nni-root:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.nni-root--disabled {
  opacity: 0.48;
  pointer-events: none;
}

/* Sizes */
.nni-root--sm { height: 28px; }
.nni-root--md { height: 32px; }

/* Native spinner hidden */
.nni-input::-webkit-outer-spin-button,
.nni-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.nni-input { -moz-appearance: textfield; }

.nni-input {
  flex: 1;
  min-width: 0;
  width: 52px;
  border: none;
  background: transparent;
  outline: none;
  text-align: center;
  font: 500 12px var(--font-ui);
  color: var(--text-1);
  padding: 0;
  caret-color: var(--accent);
}

.nni-input::placeholder {
  color: var(--text-4);
  font-weight: 400;
}

.nni-step {
  display: grid;
  place-items: center;
  width: 24px;
  height: 100%;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.nni-step:first-child {
  border-right: 1px solid var(--line-1);
}

.nni-step:last-child {
  border-left: 1px solid var(--line-1);
}

.nni-step:hover:not(:disabled) {
  background: var(--hover-strong);
  color: var(--text-1);
}

.nni-step:active:not(:disabled) {
  background: var(--press);
}

.nni-step:disabled {
  color: var(--text-4);
  cursor: not-allowed;
}
</style>
