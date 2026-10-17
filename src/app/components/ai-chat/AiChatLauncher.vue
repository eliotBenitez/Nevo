<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

export type AiChatBadge = 'none' | 'busy' | 'unread' | 'warning'

const props = defineProps<{
  expanded: boolean
  badge: AiChatBadge
  phone: boolean
  /** Display form of the user's `ai.chat.toggle` binding, e.g. "Ctrl J". */
  shortcut: string
  keyShortcuts: string
}>()
const emit = defineEmits<{ toggle: [] }>()

const { t } = useI18n()
const el = ref<HTMLButtonElement | null>(null)

const STATUS_KEYS = { busy: 'busy', unread: 'unread', warning: 'offline' } as const
const ariaLabel = computed(() => props.badge === 'none'
  ? t('aiChat.launcher.label')
  : `${t('aiChat.launcher.label')}. ${t(`aiChat.launcher.${STATUS_KEYS[props.badge]}`)}`)

defineExpose({ focus: () => el.value?.focus(), el })
</script>

<template>
  <button
    ref="el"
    type="button"
    class="ai-fab"
    :class="[`ai-fab--${badge}`, { 'ai-fab--phone': phone }]"
    aria-controls="ai-chat-panel"
    :aria-expanded="expanded"
    :aria-keyshortcuts="keyShortcuts || undefined"
    :aria-label="ariaLabel"
    :inert="expanded || undefined"
    @click="emit('toggle')"
  >
    <svg class="ai-fab__mark" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 4.5h13a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5h-6.2L8 20.6v-3.1H5.5A2.5 2.5 0 0 1 3 15V7a2.5 2.5 0 0 1 2.5-2.5Z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" />
      <path d="M12 7.4c.32 1.66 1.14 2.48 2.8 2.8-1.66.32-2.48 1.14-2.8 2.8-.32-1.66-1.14-2.48-2.8-2.8 1.66-.32 2.48-1.14 2.8-2.8Z" fill="currentColor" />
    </svg>
    <span class="ai-fab__label" aria-hidden="true">
      {{ t('aiChat.launcher.label') }}
      <kbd v-if="shortcut" class="nv-kbd">{{ shortcut }}</kbd>
    </span>
    <span v-if="badge !== 'none'" class="ai-fab__badge" aria-hidden="true" />
  </button>
</template>
