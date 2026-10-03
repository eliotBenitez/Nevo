<script setup lang="ts">
defineProps<{
  title: string
  hint: string
}>()
</script>

<template>
  <div
    class="edgeless-canvas__collapsed-card tw:absolute tw:inset-0 tw:flex tw:flex-col tw:justify-center tw:gap-1 tw:box-border tw:overflow-hidden tw:rounded-[18px] tw:border tw:border-solid tw:border-transparent tw:bg-surface-raised tw:p-4 tw:px-5 tw:shadow-(--shadow-raised) tw:pointer-events-auto"
  >
    <span class="edgeless-canvas__collapsed-card__title tw:overflow-hidden tw:text-content-primary tw:text-[15px] tw:font-semibold tw:text-ellipsis tw:whitespace-nowrap">{{ title }}</span>
    <span class="edgeless-canvas__collapsed-card__hint tw:text-content-muted tw:text-xs">{{ hint }}</span>
  </div>
</template>
