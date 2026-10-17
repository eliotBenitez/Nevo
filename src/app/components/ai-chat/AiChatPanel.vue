<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { describeEndpoint } from '../../../core/ai-chat/endpoint'
import type { ChatSource } from '../../../core/ai-chat/prompt'
import { useAiChatStore } from '../../../stores/aiChat'
import { useTreeStore } from '../../../stores/tree'
import { useWorkspaceStore } from '../../../stores/workspace'
import { ChevronDown, FileText, Library, Minus, PanelRight, PictureInPicture2, SquarePen, X } from '../../../ui/icons'
import type { NvMenuItemDef } from '../../../ui/primitives/menu-types'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvPopupMenu from '../../../ui/primitives/NvPopupMenu.vue'
import type { useAiChatActions } from '../../composables/aiChat/useAiChatActions'
import { useAiChatSession } from '../../composables/aiChat/useAiChatSession'
import { useAiChatUiActions } from '../../composables/aiChat/useAiChatUiActions'
import AiChatComposer from './AiChatComposer.vue'
import AiChatEmptyState from './AiChatEmptyState.vue'
import AiChatMessage from './AiChatMessage.vue'

const props = defineProps<{
  variant: 'floating' | 'docked' | 'sheet'
  actions: ReturnType<typeof useAiChatActions>
  /** Id of the note open in the editor, if any. */
  noteId: string | null
}>()
const emit = defineEmits<{ 'open-settings': [] }>()

const { t } = useI18n()
const store = useAiChatStore()
const tree = useTreeStore()
const workspace = useWorkspaceStore()
const session = useAiChatSession()
const ui = useAiChatUiActions(props.actions)

const log = ref<HTMLElement | null>(null)
const composer = ref<InstanceType<typeof AiChatComposer> | null>(null)
let pinned = true

const firstQuestion = computed(() => store.messages.find(m => m.role === 'user')?.text ?? '')
const title = computed(() => firstQuestion.value || t('aiChat.header.newChatTitle'))
const noteTitle = computed(() => (props.noteId && tree.noteById.get(props.noteId)?.title) || t('aiChat.untitled'))
const endpoint = computed(() => describeEndpoint(workspace.settings.ai.baseUrl))

const scopeItems = computed<NvMenuItemDef[]>(() => [
  { label: t('aiChat.scope.workspace'), icon: Library, action: () => { store.scope = 'workspace' } },
  { label: t('aiChat.scope.note'), icon: FileText, action: () => { store.scope = 'note' } },
])

function onScroll() {
  const el = log.value
  if (el) pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

// Follow the stream unless the user scrolled up to read earlier text.
watch(
  // Status too: sources, actions and the error card appear only when a reply settles.
  () => {
    const last = store.messages.at(-1)
    return [store.messages.length, last?.text.length, last?.role === 'assistant' ? last.status : null]
  },
  async () => {
    await nextTick()
    if (pinned && log.value) log.value.scrollTop = log.value.scrollHeight
  },
)

function send(text: string) {
  pinned = true
  void session.send(text)
}

function questionBefore(messageId: string): string {
  const index = store.messages.findIndex(m => m.id === messageId)
  const previous = store.messages[index - 1]
  return previous?.role === 'user' ? previous.text : ''
}

function openSource(source: ChatSource) {
  props.actions.openSource(source)
}

defineExpose({ focusComposer: () => composer.value?.focus() })
</script>

<template>
  <section id="ai-chat-panel" class="ai-panel" :class="`ai-panel--${variant}`" :aria-label="t('aiChat.dialogLabel')">
    <div v-if="variant === 'sheet'" class="ai-grab" aria-hidden="true" />
    <header class="ai-head">
      <h2 class="ai-head__title" :title="title">{{ title }}</h2>
      <NvButton variant="ghost" icon :aria-label="t('aiChat.header.newChat')" :title="t('aiChat.header.newChat')" @click="store.newChat()">
        <SquarePen :size="16" aria-hidden="true" />
      </NvButton>
      <NvButton
        v-if="variant !== 'sheet'"
        variant="ghost"
        icon
        :aria-label="variant === 'docked' ? t('aiChat.header.undock') : t('aiChat.header.dock')"
        :title="variant === 'docked' ? t('aiChat.header.undock') : t('aiChat.header.dock')"
        @click="store.setDocked(variant !== 'docked')"
      >
        <component :is="variant === 'docked' ? PictureInPicture2 : PanelRight" :size="16" aria-hidden="true" />
      </NvButton>
      <NvButton variant="ghost" icon :aria-label="t('aiChat.header.collapse')" :title="t('aiChat.header.collapse')" @click="store.setOpen(false)">
        <component :is="variant === 'sheet' ? X : Minus" :size="16" aria-hidden="true" />
      </NvButton>
    </header>

    <div class="ai-scope">
      {{ t('aiChat.scope.searchingIn') }}
      <NvPopupMenu :items="scopeItems" placement="bottom-start">
        <template #trigger>
          <button type="button" class="ai-chip ai-chip--scope" :aria-label="`${t('aiChat.scope.menuLabel')}: ${store.scope === 'workspace' ? t('aiChat.scope.workspace') : t('aiChat.scope.note')}`">
            <component :is="store.scope === 'workspace' ? Library : FileText" :size="14" aria-hidden="true" />
            <span>{{ store.scope === 'workspace' ? t('aiChat.scope.workspace') : t('aiChat.scope.note') }}</span>
            <ChevronDown :size="14" aria-hidden="true" />
          </button>
        </template>
      </NvPopupMenu>
      <button
        v-if="noteId && store.includeCurrentNote"
        type="button"
        class="ai-chip"
        :aria-label="t('aiChat.scope.removeNote')"
        :title="t('aiChat.scope.removeNote')"
        @click="store.includeCurrentNote = false"
      >
        <FileText :size="14" aria-hidden="true" />
        <span>{{ noteTitle }}</span>
        <X :size="12" aria-hidden="true" />
      </button>
    </div>

    <div ref="log" class="ai-log" role="log" aria-live="polite" :aria-label="t('aiChat.log.label')" @scroll="onScroll">
      <AiChatEmptyState v-if="!store.messages.length" :has-note="!!noteId" @pick="send" />
      <AiChatMessage
        v-for="message in store.messages"
        :key="message.id"
        :message="message"
        @open-source="openSource"
        @insert="ui.insert(message.text)"
        @replace="message.role === 'assistant' && message.selection && ui.replace(message.selection, message.text)"
        @copy="ui.copy(message.text)"
        @save-note="ui.saveAsNote(questionBefore(message.id), message.text)"
        @retry="session.retry(message.id)"
        @open-settings="emit('open-settings')"
      />
    </div>

    <AiChatComposer
      ref="composer"
      :streaming="store.streaming"
      :model="workspace.settings.ai.defaultModel"
      :local="endpoint.local"
      :host="endpoint.host"
      @submit="send"
      @stop="session.stop()"
      @open-settings="emit('open-settings')"
    />
  </section>
</template>
