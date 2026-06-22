<script setup lang="ts">
import { ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, Copy, Trash2 } from 'lucide-vue-next'

defineProps<{
  left: number
  top: number
}>()

const emit = defineEmits<{
  'bring-to-front': []
  'bring-forward': []
  'send-backward': []
  'send-to-back': []
  'duplicate': []
  'delete': []
}>()
</script>

<template>
  <div
    class="draw-context-toolbar"
    :style="{ left: `${left}px`, top: `${top}px` }"
  >
    <button type="button" class="draw-context-toolbar__btn" title="На передний план (Ctrl+Shift+])" @click="emit('bring-to-front')"><ChevronsUp :size="16" /></button>
    <button type="button" class="draw-context-toolbar__btn" title="Выше (Ctrl+])" @click="emit('bring-forward')"><ChevronUp :size="16" /></button>
    <button type="button" class="draw-context-toolbar__btn" title="Ниже (Ctrl+[)" @click="emit('send-backward')"><ChevronDown :size="16" /></button>
    <button type="button" class="draw-context-toolbar__btn" title="На задний план (Ctrl+Shift+[)" @click="emit('send-to-back')"><ChevronsDown :size="16" /></button>
    <span class="draw-context-toolbar__divider" />
    <button type="button" class="draw-context-toolbar__btn" title="Дублировать (Ctrl+D)" @click="emit('duplicate')"><Copy :size="15" /></button>
    <button type="button" class="draw-context-toolbar__btn draw-context-toolbar__btn--danger" title="Удалить (Del)" @click="emit('delete')"><Trash2 :size="15" /></button>
  </div>
</template>
