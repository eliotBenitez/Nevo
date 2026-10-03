<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import type { NoteMeta } from '../../../types/note'

interface NoteEmbedPickerState {
  open: boolean
  query: string
  position: { top: number; left: number }
}

defineProps<{ state: NoteEmbedPickerState; notes: NoteMeta[] }>()
const emit = defineEmits<{
  select: [id: string, title: string, icon: string]
  'update:query': [query: string]
}>()

const { t } = useI18n()

const el = ref<HTMLDivElement | null>(null)
defineExpose({ el })
</script>

<template>
  <div
    v-if="state.open"
    ref="el"
    class="note-embed-picker tw:fixed tw:z-60 tw:flex tw:max-h-[min(340px,calc(100vh-24px))] tw:w-[280px] tw:max-w-[min(280px,calc(100vw-24px))] tw:flex-col tw:overflow-hidden tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-(--menu-bg) tw:shadow-(--shadow-overlay)"
    :style="{ top: `${state.position.top}px`, left: `${state.position.left}px` }"
  >
    <input
      :value="state.query"
      class="note-embed-picker__search tw:w-full tw:shrink-0 tw:rounded-none tw:border-0 tw:bg-transparent tw:px-3.5 tw:py-2.5 tw:font-nv-ui tw:text-[13px] tw:leading-none tw:text-content-primary tw:outline-none tw:placeholder:text-content-muted"
      type="text"
      :placeholder="t('noteEmbed.searchPlaceholder')"
      autofocus
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
    />
    <ul class="note-embed-picker__list tw:min-h-0 tw:flex-1 tw:overflow-x-hidden tw:overflow-y-auto tw:px-0 tw:py-1">
      <li
        v-for="embedNote in notes"
        :key="embedNote.id"
        class="note-embed-picker__item tw:flex tw:w-full tw:cursor-pointer tw:items-center tw:gap-[9px] tw:rounded-none tw:border-0 tw:bg-transparent tw:px-3 tw:py-[7px] tw:text-left tw:font-nv-ui tw:text-[13px] tw:leading-[1.35] tw:text-content-secondary tw:transition-colors tw:duration-120 tw:hover:bg-(--accent-soft)"
        @mousedown.prevent="emit('select', embedNote.id, embedNote.title, embedNote.icon)"
      >
        <NvNoteIcon :value="embedNote.icon || '📄'" :size="16" class="note-embed-picker__icon tw:flex-[0_0_18px] tw:text-center tw:text-sm tw:leading-none" />
        <span class="note-embed-picker__title tw:min-w-0 tw:truncate tw:text-[13px] tw:font-medium tw:text-content-primary">{{ embedNote.title || t('noteEmbed.untitled') }}</span>
      </li>
      <li v-if="!notes.length" class="note-embed-picker__empty tw:px-3.5 tw:py-5 tw:text-center tw:font-nv-ui tw:text-[12.5px] tw:leading-[1.4] tw:text-content-muted">{{ t('noteEmbed.noNotesFound') }}</li>
    </ul>
  </div>
</template>
