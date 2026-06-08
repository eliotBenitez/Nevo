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
    class="editor-overlay editor-popup-panel"
    :class="className"
    :style="popoverStyle"
    @submit.prevent="emit('apply')"
  >
    <label class="editor-popup-panel__label" :for="inputId">
      {{ label }}
    </label>

    <slot />

    <div class="editor-popup-panel__meta">
      <span class="nv-kbd">{{ shortcutText }}</span>
      <span>{{ hint }}</span>
    </div>

    <div class="editor-popup-panel__actions">
      <button type="submit" class="nv-btn nv-btn--primary">
        {{ applyLabel }}
      </button>
      <button type="button" class="nv-btn" @click="emit('remove')">
        {{ removeLabel }}
      </button>
    </div>
  </form>
</template>
