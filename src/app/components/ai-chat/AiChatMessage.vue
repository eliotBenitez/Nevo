<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { stripCitations } from '../../../core/ai-chat/citations'
import { parseChatMarkdown } from '../../../core/ai-chat/markdown'
import type { ChatSource } from '../../../core/ai-chat/prompt'
import type { AiChatMessage } from '../../../stores/aiChat'
import { useTreeStore } from '../../../stores/tree'
import AiChatActionRow from './AiChatActionRow.vue'
import AiChatErrorCard from './AiChatErrorCard.vue'
import AiChatMarkdown from './AiChatMarkdown.vue'

const props = defineProps<{ message: AiChatMessage }>()
const emit = defineEmits<{
  'open-source': [source: ChatSource]
  insert: []
  replace: []
  copy: []
  'save-note': []
  retry: []
  'open-settings': []
}>()

const { t } = useI18n()
const tree = useTreeStore()

const assistant = computed(() => props.message.role === 'assistant' ? props.message : null)
const streaming = computed(() => assistant.value?.status === 'streaming')
const finished = computed(() => assistant.value?.status === 'done' || assistant.value?.status === 'stopped')

// Parsed to a typed tree and rendered as elements: model output is never HTML.
const blocks = computed(() => parseChatMarkdown(props.message.text))

function folderLabel(source: ChatSource): string {
  const folderId = tree.noteById.get(source.noteId)?.folderId
  return (folderId && tree.folderById.get(folderId)?.title) || ''
}
</script>

<template>
  <div v-if="message.role === 'user'" class="ai-msg-user">{{ message.text }}</div>
  <div v-else class="ai-msg-ai">
    <AiChatErrorCard
      v-if="assistant?.status === 'error'"
      :kind="assistant.errorKind ?? 'other'"
      :message="assistant.errorMessage"
      @retry="emit('retry')"
      @open-settings="emit('open-settings')"
    />
    <template v-else>
      <AiChatMarkdown :blocks="blocks" :sources="assistant?.sources ?? []" @open-source="emit('open-source', $event)">
        <template #tail>
          <span v-if="streaming" class="ai-caret" aria-hidden="true" />
          <span v-if="assistant?.status === 'stopped'" class="ai-stopped"> · {{ t('aiChat.message.stopped') }}</span>
        </template>
      </AiChatMarkdown>
      <div v-if="assistant?.status === 'done' && assistant.sources.length" class="ai-sources">
        <div class="ai-sources__label">{{ t('aiChat.message.sources') }}</div>
        <button v-for="source in assistant.sources" :key="source.n" type="button" class="ai-src" @click="emit('open-source', source)">
          <span class="ai-src__n">{{ source.n }}</span>
          <span class="ai-src__title">{{ source.noteTitle || t('aiChat.untitled') }}</span>
          <span class="ai-src__path">{{ folderLabel(source) }}</span>
        </button>
      </div>
      <AiChatActionRow
        v-if="finished && assistant"
        :selection-text="assistant.selection?.text"
        :answer-text="stripCitations(assistant.text)"
        @insert="emit('insert')"
        @replace="emit('replace')"
        @copy="emit('copy')"
        @save-note="emit('save-note')"
        @retry="emit('retry')"
      />
    </template>
  </div>
</template>
