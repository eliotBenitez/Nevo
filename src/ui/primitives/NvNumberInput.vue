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
  ariaLabel?: string
}

const props = withDefaults(defineProps<Props>(), {
  step: 1,
  disabled: false,
  placeholder: '0',
  size: 'sm',
  min: undefined,
  max: undefined,
  allowEmpty: false,
  ariaLabel: undefined,
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
    class="nni-root tw:inline-flex tw:items-center tw:overflow-hidden tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--input-bg) tw:transition-[background-color,box-shadow] tw:duration-100 tw:focus-within:bg-(--surface-raised) tw:focus-within:shadow-[0_0_0_2px_var(--input-ring)]"
    :class="[size === 'sm' ? 'nni-root--sm tw:h-8' : 'nni-root--md tw:h-[34px]', disabled && 'nni-root--disabled tw:pointer-events-none tw:opacity-50']"
  >
    <button
      type="button"
      class="nni-step tw:grid tw:h-full tw:w-6 tw:shrink-0 tw:cursor-pointer tw:place-items-center tw:border-0 tw:border-r tw:border-solid tw:border-r-(--border-subtle) tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:enabled:active:bg-(--press) tw:disabled:cursor-not-allowed"
      :disabled="disabled || !canDecrement"
      tabindex="-1"
      @click="decrement"
    >
      <Minus :size="10" />
    </button>

    <input
      type="number"
      :aria-label="ariaLabel"
      class="nni-input tw:w-[52px] tw:min-w-0 tw:flex-1 tw:border-0 tw:bg-transparent tw:p-0 tw:text-center tw:font-nv-ui tw:text-xs tw:font-medium tw:text-content-primary tw:caret-accent tw:outline-none tw:placeholder:font-normal tw:placeholder:text-content-muted"
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
      class="nni-step tw:grid tw:h-full tw:w-6 tw:shrink-0 tw:cursor-pointer tw:place-items-center tw:border-0 tw:border-l tw:border-solid tw:border-l-(--border-subtle) tw:bg-transparent tw:text-content-muted tw:transition-colors tw:duration-100 tw:enabled:hover:bg-(--hover-strong) tw:enabled:hover:text-content-primary tw:enabled:active:bg-(--press) tw:disabled:cursor-not-allowed"
      :disabled="disabled || !canIncrement"
      tabindex="-1"
      @click="increment"
    >
      <Plus :size="10" />
    </button>
  </div>
</template>

<style scoped>
/* Native spinner hidden */
.nni-input::-webkit-outer-spin-button,
.nni-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.nni-input { -moz-appearance: textfield; }
</style>
