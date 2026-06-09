<script setup lang="ts">
withDefaults(defineProps<{
  modelValue?: boolean
  disabled?: boolean
  size?: 'xs' | 'sm' | 'md'
  label?: string
  ariaLabel?: string
}>(), {
  modelValue: false,
  size: 'sm',
  label: undefined,
  ariaLabel: undefined,
})

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()
</script>

<template>
  <label
    class="nv-toggle"
    :class="[`nv-toggle--${size}`, disabled && 'nv-toggle--disabled']"
  >
    <input
      type="checkbox"
      role="switch"
      class="nv-toggle__input"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span class="nv-toggle__track" aria-hidden="true">
      <span class="nv-toggle__thumb" />
    </span>
    <span v-if="label" class="nv-toggle__label">{{ label }}</span>
    <slot v-else />
  </label>
</template>

<style scoped>
.nv-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
}

.nv-toggle--disabled {
  opacity: 0.48;
  cursor: not-allowed;
  pointer-events: none;
}

.nv-toggle__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.nv-toggle__track {
  flex: 0 0 auto;
  position: relative;
  width: 32px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--hover-strong);
  box-shadow: inset 0 1px 0 oklch(0 0 0 / 0.05);
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.nv-toggle__thumb {
  position: absolute;
  top: 1px;
  left: 1px;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: white;
  box-shadow:
    0 1px 3px oklch(0 0 0 / 0.25),
    0 1px 0 oklch(0 0 0 / 0.1);
  transition: left 0.15s cubic-bezier(0.2, 0.7, 0.3, 1);
}

.nv-toggle:hover:not(.nv-toggle--disabled) .nv-toggle__track {
  border-color: color-mix(in oklab, var(--accent) 34%, var(--line-strong));
}

.nv-toggle__input:checked + .nv-toggle__track {
  background: var(--accent);
  border-color: var(--accent);
  box-shadow:
    inset 0 1px 0 oklch(1 0 0 / 0.25),
    0 2px 8px var(--accent-glow);
}

.nv-toggle__input:checked + .nv-toggle__track .nv-toggle__thumb {
  left: 15px;
}

.nv-toggle__input:focus-visible + .nv-toggle__track {
  box-shadow:
    0 0 0 2px var(--accent-soft),
    inset 0 1px 0 oklch(0 0 0 / 0.05);
}

.nv-toggle__input:checked:focus-visible + .nv-toggle__track {
  box-shadow:
    0 0 0 2px var(--accent-soft),
    inset 0 1px 0 oklch(1 0 0 / 0.25),
    0 2px 8px var(--accent-glow);
}

.nv-toggle--xs .nv-toggle__track {
  width: 26px;
  height: 15px;
}

.nv-toggle--xs .nv-toggle__thumb {
  width: 11px;
  height: 11px;
}

.nv-toggle--xs .nv-toggle__input:checked + .nv-toggle__track .nv-toggle__thumb {
  left: 12px;
}

.nv-toggle--md .nv-toggle__track {
  width: 38px;
  height: 22px;
}

.nv-toggle--md .nv-toggle__thumb {
  width: 18px;
  height: 18px;
}

.nv-toggle--md .nv-toggle__input:checked + .nv-toggle__track .nv-toggle__thumb {
  left: 17px;
}

.nv-toggle__label {
  font: 500 12.5px var(--font-ui);
  color: var(--text-2);
  transition: color 0.12s ease;
}

.nv-toggle:hover:not(.nv-toggle--disabled) .nv-toggle__label {
  color: var(--text-1);
}
</style>
