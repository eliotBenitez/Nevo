<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<template>
  <div class="settings-group tw:flex tw:flex-col tw:[&+.settings-group]:mt-[10px]">
    <div v-if="title || $slots['header-actions']" class="settings-group__header tw:mb-0.5 tw:flex tw:items-center tw:justify-between tw:gap-3">
      <h4 v-if="title" class="settings-group__title tw:m-0 tw:pb-1 tw:font-nv-mono tw:text-[10.5px] tw:leading-none tw:font-medium tw:tracking-[0.06em] tw:text-content-muted tw:uppercase">{{ title }}</h4>
      <div v-if="$slots['header-actions']" class="settings-group__actions tw:ml-auto">
        <slot name="header-actions" />
      </div>
    </div>
    <div class="settings-group__body tw:flex tw:flex-col">
      <slot />
    </div>
  </div>
</template>
