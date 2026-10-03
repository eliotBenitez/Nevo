<script setup lang="ts">
defineProps<{
  open: boolean
  popoverStyle: Record<string, string>
  className?: string
  label: string
  inputId: string
  shortcutText: string
  hint: string
  applyLabel: string
  removeLabel: string
}>()

const emit = defineEmits<{
  apply: []
  remove: []
}>()
</script>

<template>
  <form
    v-if="open"
    class="editor-overlay editor-popup-panel tw:fixed tw:z-60 tw:grid tw:-translate-x-1/2 tw:gap-2.5 tw:overflow-y-auto tw:rounded-[calc(14px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:p-3.5 tw:shadow-(--shadow-overlay)"
    :class="[
      className,
      className === 'query-popover' ? 'tw:w-[min(440px,calc(100vw-24px))]' : className === 'math-popover' || className === 'vega-popover' ? 'tw:w-[min(480px,calc(100vw-24px))]' : 'tw:w-[min(520px,calc(100vw-24px))]',
    ]"
    :style="popoverStyle"
    @submit.prevent="emit('apply')"
  >
    <label class="editor-popup-panel__label tw:text-xs tw:font-semibold tw:tracking-[0.02em] tw:text-content-secondary tw:uppercase" :for="inputId">
      {{ label }}
    </label>

    <slot />

    <div class="editor-popup-panel__meta tw:flex tw:items-center tw:justify-between tw:gap-3 tw:text-[11px] tw:text-content-muted">
      <span class="nv-kbd">{{ shortcutText }}</span>
      <span>{{ hint }}</span>
    </div>

    <div class="editor-popup-panel__actions tw:flex tw:justify-end tw:gap-2">
      <button type="submit" class="nv-btn nv-btn--primary">
        {{ applyLabel }}
      </button>
      <button type="button" class="nv-btn" @click="emit('remove')">
        {{ removeLabel }}
      </button>
    </div>
  </form>
</template>
