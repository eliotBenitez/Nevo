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
    class="note-embed-picker"
    :style="{ top: `${state.position.top}px`, left: `${state.position.left}px` }"
  >
    <input
      :value="state.query"
      class="note-embed-picker__search"
      type="text"
      :placeholder="t('noteEmbed.searchPlaceholder')"
      autofocus
      @input="emit('update:query', ($event.target as HTMLInputElement).value)"
    />
    <ul class="note-embed-picker__list">
      <li
        v-for="embedNote in notes"
        :key="embedNote.id"
        class="note-embed-picker__item"
        @mousedown.prevent="emit('select', embedNote.id, embedNote.title, embedNote.icon)"
      >
        <NvNoteIcon :value="embedNote.icon || '📄'" :size="16" class="note-embed-picker__icon" />
        <span class="note-embed-picker__title">{{ embedNote.title || t('noteEmbed.untitled') }}</span>
      </li>
      <li v-if="!notes.length" class="note-embed-picker__empty">{{ t('noteEmbed.noNotesFound') }}</li>
    </ul>
  </div>
</template>
