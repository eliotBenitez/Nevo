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
    class="nv-text-input"
    :class="`nv-text-input--${size}`"
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
.nv-text-input {
  min-width: 0;
  border: 1px solid var(--line-2);
  border-radius: calc(7px * var(--radius-scale, 1));
  outline: none;
  color: var(--text-1);
  background: var(--glass-3, var(--surface-1));
  caret-color: var(--accent);
  font: 500 12px var(--font-ui);
  transition: border-color 0.12s, box-shadow 0.12s;
}

.nv-text-input--sm {
  height: 28px;
  padding: 0 8px;
}

.nv-text-input--md {
  height: 32px;
  padding: 0 10px;
  font-size: 13px;
}

.nv-text-input::placeholder {
  color: var(--text-4);
  font-weight: 400;
}

.nv-text-input:hover:not(:disabled) {
  border-color: var(--line-3);
}

.nv-text-input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.nv-text-input:disabled {
  opacity: 0.48;
  cursor: not-allowed;
}
</style>
