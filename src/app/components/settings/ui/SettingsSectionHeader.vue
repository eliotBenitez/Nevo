<script setup lang="ts">
defineProps<{
  title: string
  description?: string
  titleId?: string
}>()
</script>

<template>
  <header class="settings-section-header tw:flex tw:items-start tw:justify-between tw:gap-4 tw:px-[30px] tw:pt-5 tw:pb-[14px] tw:max-[719px]:px-4 tw:max-[719px]:pt-4">
    <div class="settings-section-header__copy tw:min-w-0 tw:flex-1">
      <h2 :id="titleId" class="settings-section-header__title tw:m-0 tw:font-nv-ui tw:text-lg tw:leading-[1.2] tw:font-semibold tw:text-content-primary">{{ title }}</h2>
      <p v-if="description" class="settings-section-header__description tw:mt-1 tw:mb-0 tw:text-[12.5px] tw:leading-normal tw:text-content-muted">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="settings-section-header__actions tw:ml-auto tw:flex tw:flex-none tw:items-center tw:gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
