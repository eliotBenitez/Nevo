<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AlertCircle, AlertTriangle, Info } from '@lucide/vue'
import NvButton from '../../../../ui/primitives/NvButton.vue'
import SettingsObjectCard from '../ui/SettingsObjectCard.vue'
import SettingsMcpAgentIcon from './SettingsMcpAgentIcon.vue'
import type { McpAgent, McpAgentStatus } from '../../../../tauri/mcp'

const props = defineProps<{
  agent: McpAgent
  status: McpAgentStatus | null
  desktop: boolean
  busy: boolean
  error?: string
  restartHint?: boolean
  isConfirming?: boolean
}>()

const emit = defineEmits<{
  (e: 'connect', agent: McpAgent): void
  (e: 'disconnect', agent: McpAgent): void
  (e: 'replace', agent: McpAgent): void
  (e: 'cancelReplace'): void
}>()

const { t } = useI18n()

const cardTone = computed<'default' | 'warning'>(() => {
  if (props.error || props.isConfirming || props.status?.kind === 'conflict' || props.status?.kind === 'needsReconnect') {
    return 'warning'
  }
  return 'default'
})

const configPath = computed(() => {
  return props.agent === 'codex' ? '~/.codex/config.toml' : '~/.claude.json'
})

const statusText = computed(() => {
  if (!props.desktop) return t('settings.mcp.agents.desktopOnly')
  if (!props.status) return t('settings.mcp.agents.loading')
  return props.status.message ?? t(`settings.mcp.agents.status.${props.status.kind}`)
})

const statusBadgeClasses = computed(() => {
  if (!props.desktop || !props.status) return 'tw:bg-[var(--surface-subtle)] tw:text-content-muted'
  switch (props.status.kind) {
    case 'connected':
      return 'tw:bg-[var(--surface-success)] tw:text-[var(--success)]'
    case 'conflict':
    case 'needsReconnect':
      return 'tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]'
    case 'error':
      return 'tw:bg-[var(--surface-danger)] tw:text-danger'
    case 'notConfigured':
    default:
      return 'tw:bg-[var(--surface-subtle)] tw:text-content-muted'
  }
})

const statusDotClasses = computed(() => {
  if (!props.desktop || !props.status) return 'tw:bg-content-muted/60'
  switch (props.status.kind) {
    case 'connected':
      return 'tw:bg-[var(--success)]'
    case 'conflict':
    case 'needsReconnect':
      return 'tw:bg-[var(--warning)]'
    case 'error':
      return 'tw:bg-danger'
    case 'notConfigured':
    default:
      return 'tw:bg-content-muted/50'
  }
})
</script>

<template>
  <SettingsObjectCard
    class="mcp-agent-row"
    :data-mcp-agent="agent"
    :tone="cardTone"
    align="center"
  >
    <template #icon>
      <SettingsMcpAgentIcon :agent="agent" />
    </template>

    <div class="mcp-agent-identity tw:min-w-0">
      <div class="mcp-agent-head tw:flex tw:items-center tw:gap-2.5 tw:flex-wrap">
        <span class="row-title tw:text-content-primary tw:text-[14px] tw:font-[550] tw:tracking-[-0.01em]">
          {{ t(`settings.mcp.agents.${agent}`) }}
        </span>
      </div>
      <div class="mcp-agent-meta tw:mt-0.5 tw:flex tw:items-center tw:gap-2 tw:text-xs tw:text-content-muted">
        <span class="tw:font-nv-mono tw:text-[12px]">{{ configPath }}</span>
      </div>
    </div>

    <div
      v-if="restartHint"
      class="mcp-agent-hint tw:mt-2 tw:flex tw:items-center tw:gap-2 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-[var(--accent-soft)] tw:px-2.5 tw:py-1.5 tw:text-xs tw:text-content-primary"
    >
      <Info :size="14" class="tw:text-accent tw:shrink-0" />
      <span class="row-sub">{{ t('settings.mcp.agents.restartHint') }}</span>
    </div>

    <div
      v-if="error"
      class="mcp-agent-error tw:mt-2 tw:flex tw:items-center tw:gap-2 tw:rounded-[calc(8px*var(--radius-scale,1))] tw:bg-surface-danger tw:px-2.5 tw:py-1.5 tw:text-xs tw:text-danger"
      role="alert"
    >
      <AlertCircle :size="14" class="tw:shrink-0" />
      <span>{{ error }}</span>
    </div>

    <template #actions>
      <div class="mcp-agent-summary tw:flex tw:min-w-0 tw:items-center tw:justify-end tw:gap-2 tw:flex-wrap">
        <span
          class="status-chip tw:inline-flex tw:max-w-full tw:items-center tw:gap-1.5 tw:rounded-full tw:px-2.5 tw:py-1 tw:text-[11.5px] tw:leading-[1.35] tw:font-medium"
          :class="statusBadgeClasses"
          role="status"
        >
          <span class="tw:size-1.5 tw:rounded-full tw:shrink-0" :class="statusDotClasses" aria-hidden="true" />
          <span>{{ statusText }}</span>
        </span>
        <div v-if="desktop && status && !isConfirming" class="mcp-agent-actions tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
          <NvButton
            v-if="status.kind === 'notConfigured' || status.kind === 'needsReconnect' || status.kind === 'conflict'"
            size="md"
            :loading="busy"
            :aria-label="`${t('settings.mcp.agents.connect')} ${t(`settings.mcp.agents.${agent}`)}`"
            @click="emit('connect', agent)"
          >
            {{ t(status.kind === 'needsReconnect' ? 'settings.mcp.agents.reconnect' : 'settings.mcp.agents.connect') }}
          </NvButton>
          <NvButton
            v-if="status.kind === 'connected' || status.kind === 'needsReconnect'"
            variant="ghost"
            size="md"
            :loading="busy"
            :aria-label="`${t('settings.mcp.agents.disconnect')} ${t(`settings.mcp.agents.${agent}`)}`"
            @click="emit('disconnect', agent)"
          >
            {{ t('settings.mcp.agents.disconnect') }}
          </NvButton>
        </div>
      </div>
    </template>

    <template v-if="isConfirming" #footer>
      <Transition name="mcp-confirm" appear>
        <div class="mcp-agent-confirm">
          <div class="mcp-agent-confirm__prompt">
            <AlertTriangle :size="16" class="tw:text-[var(--warning)] tw:shrink-0" />
            <span>{{ t('settings.mcp.agents.confirmReplace') }}</span>
          </div>
          <div class="mcp-agent-confirm__actions">
            <NvButton variant="ghost" size="md" @click="emit('cancelReplace')">
              {{ t('settings.mcp.agents.cancel') }}
            </NvButton>
            <NvButton
              data-mcp-confirm
              variant="danger"
              size="md"
              :loading="busy"
              :aria-label="`${t('settings.mcp.agents.replace')} ${t(`settings.mcp.agents.${agent}`)}`"
              @click="emit('replace', agent)"
            >
              {{ t('settings.mcp.agents.replace') }}
            </NvButton>
          </div>
        </div>
      </Transition>
    </template>
  </SettingsObjectCard>
</template>

<style scoped>
.mcp-agent-row {
  gap: 12px;
  padding: 16px;
  container-type: inline-size;
  grid-template-columns: auto minmax(0, 1fr) fit-content(55%);
}

.mcp-agent-row.settings-object-card--warning {
  box-shadow: var(--shadow-raised);
}

.mcp-agent-identity,
.mcp-agent-head,
.mcp-agent-meta,
.status-chip,
.mcp-agent-error,
.mcp-agent-hint,
.mcp-agent-actions {
  min-width: 0;
}

.status-chip > span:last-child,
.mcp-agent-meta > span,
.mcp-agent-confirm__prompt > span {
  overflow-wrap: anywhere;
}

.mcp-agent-row :deep(.settings-object-card__actions) {
  min-width: 0;
  flex-wrap: wrap;
}

.mcp-agent-summary {
  min-width: 0;
  justify-content: flex-end;
}

.mcp-agent-confirm {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-width: 0;
  padding: 12px;
  border-radius: calc(8px * var(--radius-scale, 1));
  background: var(--surface-warning);
  color: var(--text-primary);
}

.mcp-agent-confirm__prompt {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.mcp-agent-confirm__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.mcp-confirm-enter-active,
.mcp-confirm-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.mcp-confirm-enter-from,
.mcp-confirm-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

@media (prefers-reduced-motion: reduce) {
  .mcp-confirm-enter-active,
  .mcp-confirm-leave-active {
    transition: none;
  }
}

@container (max-width: 560px) {
  .mcp-agent-confirm {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 720px) {
  .mcp-agent-row {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .mcp-agent-row :deep(.settings-object-card__actions) {
    grid-column: 2;
    justify-self: start;
    margin-left: 0;
    align-self: start;
  }

  .mcp-agent-summary {
    justify-content: flex-start;
  }

  .mcp-agent-confirm__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .mcp-agent-confirm__actions :deep(.nv-btn) {
    min-height: 40px;
    justify-content: center;
  }
}
</style>
