<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileText, Library, Link, ListChecks, Search } from '../../../ui/icons'

const props = defineProps<{ hasNote: boolean }>()
const emit = defineEmits<{ pick: [question: string] }>()

const { t } = useI18n()

const suggestions = computed(() => props.hasNote
  ? [
    { icon: FileText, text: t('aiChat.empty.suggestions.summarizeNote') },
    { icon: Link, text: t('aiChat.empty.suggestions.relatedNotes') },
    { icon: ListChecks, text: t('aiChat.empty.suggestions.openTasks') },
  ]
  : [
    { icon: Search, text: t('aiChat.empty.suggestions.workspaceRecent') },
    { icon: ListChecks, text: t('aiChat.empty.suggestions.workspaceTasks') },
    { icon: Library, text: t('aiChat.empty.suggestions.workspaceThemes') },
  ])
</script>

<template>
  <div class="ai-empty">
    <div>
      <h3 class="ai-empty__heading">{{ t('aiChat.empty.heading') }}</h3>
      <p class="ai-empty__text">{{ t('aiChat.empty.description') }}</p>
    </div>
    <div class="ai-suggest">
      <div class="ai-suggest__label">{{ hasNote ? t('aiChat.empty.forNote') : t('aiChat.empty.forWorkspace') }}</div>
      <button
        v-for="item in suggestions"
        :key="item.text"
        type="button"
        class="ai-suggest__item"
        @click="emit('pick', item.text)"
      >
        <component :is="item.icon" :size="16" aria-hidden="true" />
        {{ item.text }}
      </button>
    </div>
  </div>
</template>
