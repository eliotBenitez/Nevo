<script setup lang="ts">
import NvColorPicker from '../../../ui/primitives/NvColorPicker.vue'
import type { EditorColor } from '../../../utils/editorColors'

defineProps<{
  open: boolean
  pickerStyle: Record<string, string>
  colors: EditorColor[]
}>()

const emit = defineEmits<{
  select: [color: string]
  remove: []
}>()

function onColorUpdate(value: string | null) {
  if (value === null) emit('remove')
  else emit('select', value)
}
</script>

<template>
  <div v-if="open" class="editor-overlay" :style="pickerStyle">
    <NvColorPicker :colors="colors" allow-none @update:model-value="onColorUpdate" />
  </div>
</template>
