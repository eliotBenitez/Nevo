<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ChatSource } from '../../../core/ai-chat/prompt'
import { useDeviceLayout } from '../../../composables/useDeviceLayout'
import { useAiChatStore } from '../../../stores/aiChat'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useAiChatActions } from '../../composables/aiChat/useAiChatActions'
import { useAiChatShortcut } from '../../composables/aiChat/useAiChatShortcut'
import AiChatLauncher, { type AiChatBadge } from './AiChatLauncher.vue'
import AiChatPanel from './AiChatPanel.vue'

const props = defineProps<{
  activeNoteId: string | null
  /** True while the workspace right panel is visible; the launcher and panel shift left to clear it. */
  rightPanelVisible: boolean
  /** True while the phone bottom navigation is shown; the launcher sits above it. */
  bottomNavVisible: boolean
  /** Settings and other full-screen system views: no launcher, no panel. */
  suppressed: boolean
}>()
const emit = defineEmits<{
  'open-note': [noteId: string]
  'open-source': [source: ChatSource]
  'open-settings': []
}>()

const { t } = useI18n()
const store = useAiChatStore()
const workspace = useWorkspaceStore()
const { isPhone } = useDeviceLayout()
const shortcut = useAiChatShortcut()

const actions = useAiChatActions({
  openNote: id => emit('open-note', id),
  openSource: source => emit('open-source', source),
})

const enabled = computed(() => workspace.settings.ai.enabled && !props.suppressed)
const variant = computed(() => isPhone.value ? 'sheet' : store.docked ? 'docked' : 'floating')
const showLauncher = computed(() => !(variant.value === 'docked' && store.open))
const reducedMotion = computed(() => workspace.appConfig.reducedMotion === 'reduce')

const badge = computed<AiChatBadge>(() => {
  const last = store.messages.at(-1)
  if (last?.role === 'assistant' && last.status === 'error' && (last.errorKind === 'offline' || last.errorKind === 'privacy')) return 'warning'
  if (store.streaming && !store.open) return 'busy'
  return store.unread ? 'unread' : 'none'
})

const anchorStyle = computed(() => ({
  '--ai-right-extra': props.rightPanelVisible ? '296px' : '0px',
  '--ai-bottom-extra': props.bottomNavVisible
    ? 'calc(76px + max(var(--safe-area-bottom), 0px))'
    // The phone editor's floating format bar (min-h 56px at bottom 20px) owns the corner while a note is open.
    : isPhone.value && props.activeNoteId ? 'calc(68px + var(--mobile-keyboard-inset, 0px))' : '0px',
}))

const launcher = ref<InstanceType<typeof AiChatLauncher> | null>(null)
const panel = ref<InstanceType<typeof AiChatPanel> | null>(null)
let opener: HTMLElement | null = null

// Runs before the render flush, so activeElement is still where the user was when they opened the chat.
watch(() => store.open, async (open) => {
  if (open) {
    const active = document.activeElement
    opener = active instanceof HTMLElement && active !== document.body && !active.closest('#ai-chat-panel') ? active : null
  }
  await nextTick()
  if (open) {
    panel.value?.focusComposer()
  } else {
    const target = opener?.isConnected ? opener : launcher.value?.el
    target?.focus({ preventScroll: true })
    opener = null
  }
})

function close() {
  store.setOpen(false)
}

function onEscape(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  event.preventDefault()
  close()
}
</script>

<template>
  <template v-if="enabled">
    <AiChatLauncher
      v-if="showLauncher"
      ref="launcher"
      :style="anchorStyle"
      :expanded="store.open"
      :badge="badge"
      :phone="isPhone"
      :shortcut="shortcut.label.value"
      :key-shortcuts="shortcut.ariaShortcut.value"
      @toggle="store.toggle()"
    />

    <Teleport v-if="variant === 'sheet'" to="body">
      <div class="ai-chat-scrim" :class="{ 'ai-chat-scrim--open': store.open }" aria-hidden="true" @click="close" />
      <div
        class="ai-chat-sheet"
        :class="{ 'ai-chat-sheet--open': store.open, 'workspace-root--reduced-motion': reducedMotion }"
        role="dialog"
        aria-modal="true"
        :aria-label="t('aiChat.dialogLabel')"
        :inert="!store.open || undefined"
        @keydown.esc="onEscape"
      >
        <AiChatPanel ref="panel" variant="sheet" :actions="actions" :note-id="activeNoteId" @open-settings="emit('open-settings')" />
      </div>
    </Teleport>

    <div
      v-else-if="variant === 'floating'"
      class="ai-chat-float"
      :class="{ 'ai-chat-float--open': store.open }"
      :style="anchorStyle"
      role="dialog"
      aria-modal="false"
      :aria-label="t('aiChat.dialogLabel')"
      :inert="!store.open || undefined"
      @keydown.esc="onEscape"
    >
      <AiChatPanel ref="panel" variant="floating" :actions="actions" :note-id="activeNoteId" @open-settings="emit('open-settings')" />
    </div>

    <div
      v-else
      class="workspace-ai-dock-shell"
      :class="{ 'workspace-ai-dock-shell--hidden': !store.open }"
      :inert="!store.open || undefined"
      @keydown.esc="onEscape"
    >
      <AiChatPanel ref="panel" variant="docked" :actions="actions" :note-id="activeNoteId" @open-settings="emit('open-settings')" />
    </div>
  </template>
</template>
