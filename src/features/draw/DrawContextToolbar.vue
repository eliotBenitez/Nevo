<script setup lang="ts">
import { ChevronsUp, ChevronUp, ChevronDown, ChevronsDown, Copy, Trash2 } from '@lucide/vue'

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
    class="draw-context-toolbar tw:absolute tw:z-5 tw:flex tw:items-center tw:gap-0.5 tw:p-1 tw:border tw:border-solid tw:border-transparent tw:rounded-[10px] tw:bg-(--menu-bg) tw:shadow-(--shadow-overlay) tw:-translate-x-1/2 tw:-translate-y-full"
    :style="{ left: `${left}px`, top: `${top}px` }"
  >
    <button type="button" class="draw-context-toolbar__btn tw:inline-flex tw:items-center tw:justify-center tw:size-7 tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary" title="На передний план (Ctrl+Shift+])" @click="emit('bring-to-front')"><ChevronsUp :size="16" /></button>
    <button type="button" class="draw-context-toolbar__btn tw:inline-flex tw:items-center tw:justify-center tw:size-7 tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary" title="Выше (Ctrl+])" @click="emit('bring-forward')"><ChevronUp :size="16" /></button>
    <button type="button" class="draw-context-toolbar__btn tw:inline-flex tw:items-center tw:justify-center tw:size-7 tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary" title="Ниже (Ctrl+[)" @click="emit('send-backward')"><ChevronDown :size="16" /></button>
    <button type="button" class="draw-context-toolbar__btn tw:inline-flex tw:items-center tw:justify-center tw:size-7 tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary" title="На задний план (Ctrl+Shift+[)" @click="emit('send-to-back')"><ChevronsDown :size="16" /></button>
    <span class="draw-context-toolbar__divider tw:w-px tw:self-stretch tw:my-0.5 tw:mx-[3px] tw:bg-(--border-subtle)" />
    <button type="button" class="draw-context-toolbar__btn tw:inline-flex tw:items-center tw:justify-center tw:size-7 tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-content-primary" title="Дублировать (Ctrl+D)" @click="emit('duplicate')"><Copy :size="15" /></button>
    <button type="button" class="draw-context-toolbar__btn draw-context-toolbar__btn--danger tw:inline-flex tw:items-center tw:justify-center tw:size-7 tw:border tw:border-solid tw:border-transparent tw:rounded-md tw:bg-transparent tw:text-content-secondary tw:transition-colors tw:duration-100 tw:hover:bg-(--hover-strong) tw:hover:text-danger" title="Удалить (Del)" @click="emit('delete')"><Trash2 :size="15" /></button>
  </div>
</template>
