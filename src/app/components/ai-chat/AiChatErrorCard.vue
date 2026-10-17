<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { describeEndpoint, type AiErrorKind } from '../../../core/ai-chat/endpoint'
import { useWorkspaceStore } from '../../../stores/workspace'
import { AlertTriangle, PlugZap, RefreshCw, Shield } from '../../../ui/icons'
import NvButton from '../../../ui/primitives/NvButton.vue'

const props = defineProps<{ kind: AiErrorKind; message?: string }>()
const emit = defineEmits<{ retry: []; 'open-settings': [] }>()

const { t } = useI18n()
const workspace = useWorkspaceStore()
const host = computed(() => describeEndpoint(workspace.settings.ai.baseUrl).host)

const icon = computed(() => props.kind === 'offline' ? PlugZap : props.kind === 'privacy' ? Shield : AlertTriangle)
const tone = computed(() => props.kind === 'offline' || props.kind === 'rateLimit' ? 'warn' : 'bad')
</script>

<template>
  <div class="ai-state" role="alert">
    <span class="ai-state__icon" :class="`ai-state__icon--${tone}`"><component :is="icon" :size="18" aria-hidden="true" /></span>
    <template v-if="kind === 'offline'">
      <h4 class="ai-state__title">{{ t('aiChat.error.offlineTitle') }}</h4>
      <p class="ai-state__text">{{ t('aiChat.error.offlineBody', { host }) }}</p>
    </template>
    <template v-else-if="kind === 'privacy'">
      <h4 class="ai-state__title">{{ t('aiChat.error.privacyTitle') }}</h4>
      <p class="ai-state__text">{{ t('aiChat.error.privacyBody', { host }) }}</p>
    </template>
    <template v-else-if="kind === 'rateLimit'">
      <h4 class="ai-state__title">{{ t('aiChat.error.rateLimitTitle') }}</h4>
      <p class="ai-state__text">{{ t('aiChat.error.rateLimitBody', { host }) }}</p>
    </template>
    <template v-else-if="kind === 'auth'">
      <h4 class="ai-state__title">{{ t('aiChat.error.authTitle') }}</h4>
      <p class="ai-state__text">{{ t('aiChat.error.authBody', { host }) }}</p>
    </template>
    <template v-else>
      <h4 class="ai-state__title">{{ t('aiChat.error.otherTitle') }}</h4>
      <p v-if="message" class="ai-state__text">{{ message }}</p>
    </template>
    <div class="ai-state__row">
      <NvButton v-if="kind === 'privacy'" variant="primary" @click="emit('open-settings')">{{ t('aiChat.error.chooseLocal') }}</NvButton>
      <NvButton v-else variant="primary" @click="emit('retry')"><RefreshCw :size="14" aria-hidden="true" />{{ t('aiChat.error.retry') }}</NvButton>
      <NvButton variant="ghost" @click="emit('open-settings')">{{ t('aiChat.error.openSettings') }}</NvButton>
    </div>
  </div>
</template>
