<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import type { CSSProperties } from 'vue'

const props = defineProps<{
  text: string
  style: CSSProperties
  label: string
}>()

const emit = defineEmits<{
  commit: [text: string]
  cancel: []
}>()

const value = ref(props.text)
const input = ref<HTMLTextAreaElement | null>(null)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('cancel')
    event.preventDefault()
  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    emit('commit', value.value)
    event.preventDefault()
  }
}

onMounted(() => {
  void nextTick(() => {
    input.value?.focus()
    input.value?.select()
  })
})
</script>

<template>
  <textarea
    ref="input"
    v-model="value"
    class="canvas-inline-text-editor"
    :style="style"
    :aria-label="label"
    @blur="$emit('commit', value)"
    @keydown="onKeydown"
    @pointerdown.stop
  />
</template>

<style scoped>
.canvas-inline-text-editor {
  position: absolute;
  z-index: 45;
  min-width: 60px;
  min-height: 36px;
  resize: none;
  border: 1px solid var(--accent);
  border-radius: 8px;
  outline: 0;
  color: var(--text-primary);
  background: color-mix(in srgb, var(--canvas-1) 94%, transparent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent);
  font: inherit;
  line-height: 1.35;
}
</style>
