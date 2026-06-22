<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'

const props = defineProps<{
  active: boolean
  editId: number
  value: string
  style: Record<string, string>
}>()

const emit = defineEmits<{
  input: [text: string]
  blur: []
  keydown: [e: KeyboardEvent]
}>()

const el = ref<HTMLElement | null>(null)

watch(
  () => props.editId,
  () => {
    if (!props.active) return
    void nextTick(() => {
      if (!el.value) return
      el.value.innerText = props.value
      el.value.focus()
    })
  },
)
</script>

<template>
  <div
    v-if="active"
    ref="el"
    class="draw-text-input"
    contenteditable="plaintext-only"
    spellcheck="false"
    :style="style"
    @input="emit('input', ($event.target as HTMLElement).innerText)"
    @blur="emit('blur')"
    @keydown="emit('keydown', $event)"
    @pointerdown.stop
  />
</template>
