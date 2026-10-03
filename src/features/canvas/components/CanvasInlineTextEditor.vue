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
    class="canvas-inline-text-editor tw:absolute tw:z-45 tw:min-w-[60px] tw:min-h-9 tw:resize-none tw:rounded-lg tw:border tw:border-solid tw:border-accent tw:text-content-primary tw:bg-[color-mix(in_srgb,var(--surface-canvas)_94%,transparent)] tw:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)] tw:font-[inherit] tw:leading-[1.35] tw:outline-0"
    :style="style"
    :aria-label="label"
    @blur="$emit('commit', value)"
    @keydown="onKeydown"
    @pointerdown.stop
  />
</template>
