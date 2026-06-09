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
    class="nv-checkbox"
    :class="[`nv-checkbox--${size}`, disabled && 'nv-checkbox--disabled']"
  >
    <input
      ref="inputRef"
      type="checkbox"
      class="nv-checkbox__input"
      :checked="modelValue"
      :disabled="disabled"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="nv-checkbox__box" aria-hidden="true">
      <Minus v-if="indeterminate" :size="iconSize" :stroke-width="2.5" />
      <Check v-else-if="modelValue" :size="iconSize" :stroke-width="2.5" />
    </span>
    <span v-if="label" class="nv-checkbox__label">{{ label }}</span>
    <slot v-else />
  </label>
</template>

<style scoped>
.nv-checkbox {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.nv-checkbox--disabled {
  opacity: 0.48;
  cursor: not-allowed;
  pointer-events: none;
}

.nv-checkbox__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.nv-checkbox__box {
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1.5px solid var(--line-strong);
  background: var(--glass-3, var(--surface-1));
  color: white;
  transition: background 0.12s, border-color 0.12s, box-shadow 0.12s;
}

.nv-checkbox:hover:not(.nv-checkbox--disabled) .nv-checkbox__box {
  border-color: var(--accent);
}

.nv-checkbox__input:checked + .nv-checkbox__box,
.nv-checkbox__input:indeterminate + .nv-checkbox__box {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow: 0 2px 8px var(--accent-glow);
}

.nv-checkbox__input:focus-visible + .nv-checkbox__box {
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.nv-checkbox--xs .nv-checkbox__box { width: 12px; height: 12px; border-radius: 3px; }
.nv-checkbox--md .nv-checkbox__box { width: 20px; height: 20px; border-radius: 5px; }

.nv-checkbox__label {
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  transition: color 0.12s;
}

.nv-checkbox:hover:not(.nv-checkbox--disabled) .nv-checkbox__label {
  color: var(--text-1);
}
</style>
