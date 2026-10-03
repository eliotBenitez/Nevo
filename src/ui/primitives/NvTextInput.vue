<script setup lang="ts">
interface Props {
  modelValue: string
  type?: 'text' | 'search' | 'url' | 'email' | 'password'
  disabled?: boolean
  placeholder?: string
  ariaLabel?: string
  maxlength?: number
  autocomplete?: string
  size?: 'sm' | 'md'
}

withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  placeholder: '',
  ariaLabel: undefined,
  maxlength: undefined,
  autocomplete: undefined,
  size: 'sm',
})

const sizeClasses = {
  sm: 'tw:h-8 tw:px-[10px]',
  md: 'tw:h-[34px] tw:px-3 tw:text-[13px]',
} as const

const emit = defineEmits<{
  'update:modelValue': [value: string]
  change: [value: string]
}>()

function inputValue(event: Event): string {
  return (event.target as HTMLInputElement).value
}
</script>

<template>
  <input
    :type="type"
    class="nv-text-input tw:min-w-0 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-[var(--input-bg)] tw:text-[12px] tw:font-medium tw:font-nv-ui tw:text-content-primary tw:caret-accent tw:outline-none tw:transition-[background-color,border-color,box-shadow] tw:duration-[140ms] tw:placeholder:font-normal tw:placeholder:text-content-muted tw:disabled:cursor-not-allowed tw:disabled:opacity-[0.48]"
    :class="[`nv-text-input--${size}`, sizeClasses[size]]"
    :value="modelValue"
    :disabled="disabled"
    :placeholder="placeholder"
    :aria-label="ariaLabel"
    :maxlength="maxlength"
    :autocomplete="autocomplete"
    @input="emit('update:modelValue', inputValue($event))"
    @change="emit('change', inputValue($event))"
  >
</template>

<style scoped>
.nv-text-input:hover:not(:disabled) {
  background: color-mix(in oklab, var(--input-bg) 88%, var(--text-primary) 6%);
}

.nv-text-input:focus-visible {
  background: var(--surface-raised);
  border-color: transparent;
  box-shadow: 0 0 0 2px var(--input-ring);
}

.nv-text-input[aria-invalid="true"] {
  background: var(--surface-danger);
  border-color: transparent;
  box-shadow: 0 0 0 2px var(--danger);
}

</style>
