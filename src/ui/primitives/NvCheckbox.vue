<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, Minus } from 'lucide-vue-next'

const props = withDefaults(defineProps<{
  modelValue?: boolean
  indeterminate?: boolean
  disabled?: boolean
  size?: 'xs' | 'sm' | 'md'
  label?: string
}>(), {
  modelValue: false,
  size: 'sm',
  label: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const boxSizeClasses = {
  xs: 'tw:size-3 tw:rounded-[calc(3px*var(--radius-scale,1))]',
  sm: 'tw:size-4 tw:rounded-[calc(4px*var(--radius-scale,1))]',
  md: 'tw:size-5 tw:rounded-[calc(5px*var(--radius-scale,1))]',
} as const

const inputRef = ref<HTMLInputElement | null>(null)

const iconSize = computed(() => {
  if (props.size === 'xs') return 8
  if (props.size === 'md') return 12
  return 10
})

watch(
  () => props.indeterminate,
  (v) => { if (inputRef.value) inputRef.value.indeterminate = v ?? false },
  { immediate: true },
)
</script>

<template>
  <label
    class="nv-checkbox tw:inline-flex tw:items-center tw:gap-2 tw:select-none"
    :class="[`nv-checkbox--${size}`, disabled ? 'nv-checkbox--disabled tw:pointer-events-none tw:cursor-not-allowed tw:opacity-[0.48]' : 'tw:cursor-pointer']"
  >
    <input
      ref="inputRef"
      type="checkbox"
      class="nv-checkbox__input tw:peer tw:pointer-events-none tw:absolute tw:size-px tw:opacity-0"
      :checked="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span
      class="nv-checkbox__box tw:grid tw:shrink-0 tw:place-items-center tw:border-[1.5px] tw:border-solid tw:border-line-strong tw:bg-surface-overlay tw:text-content-on-accent tw:transition-[background-color,border-color,box-shadow] tw:duration-[120ms] tw:peer-checked:border-accent tw:peer-checked:bg-accent tw:peer-indeterminate:border-accent tw:peer-indeterminate:bg-accent tw:peer-focus-visible:outline-2 tw:peer-focus-visible:outline-solid tw:peer-focus-visible:outline-focus-ring tw:peer-focus-visible:outline-offset-2"
      :class="boxSizeClasses[size]"
      aria-hidden="true"
    >
      <Minus v-if="indeterminate" :size="iconSize" :stroke-width="2.5" />
      <Check v-else-if="modelValue" :size="iconSize" :stroke-width="2.5" />
    </span>
    <span v-if="label" class="nv-checkbox__label tw:font-nv-ui tw:text-[12.5px] tw:font-medium tw:text-content-secondary">{{ label }}</span>
    <slot v-else />
  </label>
</template>

<style scoped>
.nv-checkbox:hover:not(.nv-checkbox--disabled) .nv-checkbox__box {
  border-color: var(--accent);
}

.nv-checkbox__label { transition: color 0.12s; }
.nv-checkbox:hover:not(.nv-checkbox--disabled) .nv-checkbox__label { color: var(--text-primary); }
</style>
