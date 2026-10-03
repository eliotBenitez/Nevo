<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'default' | 'warning'
  align?: 'start' | 'center'
}>(), {
  tone: 'default',
  align: 'start',
})
</script>

<template>
  <div
    class="settings-object-card tw:mb-2 tw:grid tw:grid-cols-[auto_minmax(0,1fr)_auto] tw:gap-3 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-[var(--surface-raised)] tw:px-[14px] tw:py-3 tw:text-content-primary tw:shadow-[var(--shadow-raised)] tw:last:mb-0"
    :class="[
      align === 'center' ? 'tw:items-center' : 'tw:items-start',
      {
        'is-issue': tone === 'warning',
        'settings-object-card--warning': tone === 'warning',
      },
    ]"
  >
    <div v-if="$slots.icon" class="settings-object-card__icon tw:grid tw:size-9 tw:flex-none tw:place-items-center tw:rounded-[calc(9px*var(--radius-scale,1))] tw:bg-surface-subtle tw:text-content-secondary">
      <slot name="icon" />
    </div>

    <div class="settings-object-card__body tw:flex tw:min-w-0 tw:flex-col tw:gap-1">
      <slot />
      <div v-if="$slots.meta" class="settings-object-card__meta tw:mt-1 tw:flex tw:flex-wrap tw:items-center tw:gap-2 tw:text-xs tw:text-content-muted">
        <slot name="meta" />
      </div>
    </div>

    <div v-if="$slots.actions" class="settings-object-card__actions tw:ml-auto tw:flex tw:flex-none tw:items-center tw:self-center tw:gap-[6px]">
      <slot name="actions" />
    </div>

    <div v-if="$slots.footer" class="settings-object-card__footer tw:col-span-full tw:min-w-0">
      <slot name="footer" />
    </div>
  </div>
</template>
