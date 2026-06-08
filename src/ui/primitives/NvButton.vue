<script setup lang="ts">
withDefaults(defineProps<{
  variant?: 'default' | 'ghost' | 'primary' | 'danger'
  size?: 'xs' | 'sm' | 'md'
  icon?: boolean
  loading?: boolean
  active?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>(), {
  type: 'button',
})
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="[
      'nv-btn',
      variant === 'ghost' && 'nv-btn--ghost',
      variant === 'primary' && 'nv-btn--primary',
      variant === 'danger' && 'nv-btn--danger',
      size === 'xs' && 'nv-btn--xs',
      size === 'md' && 'nv-btn--md',
      icon && 'nv-btn--icon',
      loading && 'nv-btn--loading',
      active && 'nv-btn--active',
    ]"
  >
    <span v-if="loading" class="nv-btn__spinner" aria-hidden="true" />
    <slot />
  </button>
</template>
