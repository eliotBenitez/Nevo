<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import NvModal from '../../../ui/primitives/NvModal.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const value = defineModel<string>({ required: true })

const { t } = useI18n()

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    emit('confirm')
  }
}
</script>

<template>
  <NvModal :open="open" size="md" labelled-by="ai-ask-title" @close="emit('cancel')">
    <template #header>
      <!-- No visible heading existed pre-migration (the old panel used
           :aria-label directly); this stays visually hidden so the compact
           title/input layout below keeps its spot while NvModal still gets a
           real element to point aria-labelledby at. -->
      <h2 id="ai-ask-title" class="ai-ask-modal__visually-hidden tw:sr-only">{{ t('editor.aiAsk.title') }}</h2>
    </template>

    <p class="ai-ask-modal__title tw:m-0 tw:mb-3 tw:text-sm tw:font-semibold tw:text-content-primary">{{ t('editor.aiAsk.title') }}</p>
    <input
      v-model="value"
      class="ai-ask-modal__input tw:w-full tw:box-border tw:px-2.5 tw:py-2 tw:border tw:border-solid tw:border-line-default tw:rounded-nv-md tw:bg-surface-subtle tw:text-content-primary tw:text-sm tw:outline-none tw:focus:border-accent"
      type="text"
      :placeholder="t('editor.aiAsk.placeholder')"
      autofocus
      @keydown="onKeyDown"
    />

    <template #footer>
      <button type="button" class="nv-btn nv-btn--ghost" @click="emit('cancel')">
        {{ t('editor.aiAsk.cancel') }}
      </button>
      <button type="button" class="nv-btn nv-btn--primary" @click="emit('confirm')">
        {{ t('editor.aiAsk.confirm') }}
      </button>
    </template>
  </NvModal>
</template>
