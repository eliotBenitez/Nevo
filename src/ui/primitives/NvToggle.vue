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

const trackSizeClasses = {
  xs: 'tw:w-[26px] tw:h-[15px]',
  sm: 'tw:w-8 tw:h-[18px]',
  md: 'tw:w-[38px] tw:h-[22px]',
} as const

const thumbSizeClasses = {
  xs: 'tw:size-[9px]',
  sm: 'tw:size-3',
  md: 'tw:size-4',
} as const
</script>

<template>
  <label
    class="nv-toggle tw:inline-flex tw:items-center tw:gap-2 tw:select-none"
    :class="[`nv-toggle--${size}`, disabled ? 'nv-toggle--disabled tw:pointer-events-none tw:cursor-not-allowed tw:opacity-[0.48]' : 'tw:cursor-pointer']"
  >
    <input
      type="checkbox"
      role="switch"
      class="nv-toggle__input tw:peer tw:pointer-events-none tw:absolute tw:size-px tw:opacity-0"
      :checked="modelValue"
      :disabled="disabled"
      :aria-label="ariaLabel"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span
      class="nv-toggle__track tw:relative tw:flex-none tw:rounded-full tw:border tw:border-solid tw:border-transparent tw:bg-line-strong tw:peer-checked:bg-accent tw:peer-focus-visible:outline-2 tw:peer-focus-visible:outline-solid tw:peer-focus-visible:outline-focus-ring tw:peer-focus-visible:outline-offset-2"
      :class="trackSizeClasses[size]"
      aria-hidden="true"
    >
      <span
        class="nv-toggle__thumb tw:absolute tw:top-0.5 tw:left-0.5 tw:rounded-full tw:bg-[var(--surface-raised)] tw:shadow-[var(--shadow-raised)]"
        :class="thumbSizeClasses[size]"
      />
    </span>
    <span v-if="label" class="nv-toggle__label tw:font-nv-ui tw:text-[12.5px] tw:font-medium tw:text-content-secondary">{{ label }}</span>
    <slot v-else />
  </label>
</template>

<style scoped>
.nv-toggle__track {
  transition: background-color 0.15s ease, box-shadow 0.15s ease;
}

/* The border-box track and thumb preserve an even 2px inset in both states. */
.nv-toggle__thumb {
  transition: left 0.15s cubic-bezier(0.2, 0.7, 0.3, 1);
}

.nv-toggle:hover:not(.nv-toggle--disabled) .nv-toggle__track {
  background: color-mix(in oklab, var(--border-strong) 80%, var(--accent) 20%);
}

.nv-toggle__input:checked + .nv-toggle__track .nv-toggle__thumb { left: 16px; }
.nv-toggle--xs .nv-toggle__input:checked + .nv-toggle__track .nv-toggle__thumb { left: 13px; }
.nv-toggle--md .nv-toggle__input:checked + .nv-toggle__track .nv-toggle__thumb { left: 18px; }

.nv-toggle__label { transition: color 0.12s ease; }
.nv-toggle:hover:not(.nv-toggle--disabled) .nv-toggle__label { color: var(--text-primary); }
</style>
