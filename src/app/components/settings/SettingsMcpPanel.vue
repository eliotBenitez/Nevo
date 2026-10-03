<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'
import SettingsGroup from './ui/SettingsGroup.vue'
import SettingsRow from './ui/SettingsRow.vue'
import SettingsMcpAgentCard from './mcp/SettingsMcpAgentCard.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import {
  connectMcpAgent,
  disconnectMcpAgent,
  getMcpAgentStatus,
  getMcpBridgeInfo,
  type McpAgent,
  type McpAgentStatus,
  type McpAgentStatuses,
  type McpBridgeInfo,
} from '../../../tauri/mcp'
import type { McpMode } from '../../../types/workspace'
import { appLogger } from '../../../utils/logger'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings, activePath, backendKind, appMetadata } = storeToRefs(workspaceStore)

const bridge = ref<McpBridgeInfo | null>(null)
const agents = ['codex', 'claudeCode'] as const
const agentStatuses = ref<McpAgentStatuses | null>(null)
const agentError = ref<Partial<Record<McpAgent, string>>>({})
const agentBusy = ref<Partial<Record<McpAgent, boolean>>>({})
const confirmingReplacement = ref<McpAgent | null>(null)
const agentRestartHint = ref<McpAgent | null>(null)
const desktop = computed(() => appMetadata.value?.runtime === 'desktop')

const mode = computed<McpMode>(() => settings.value.mcp.mode)
const writesAllowed = computed(() => mode.value === 'ask' || mode.value === 'auto')

/** The bridge serves files, so a cloud workspace has nothing for it to open. */
const supported = computed(() => backendKind.value === 'local' && Boolean(activePath.value))

const modeOptions = computed(() => [
  { value: 'off', label: t('settings.mcp.modes.off') },
  { value: 'read-only', label: t('settings.mcp.modes.readOnly') },
  { value: 'ask', label: t('settings.mcp.modes.ask') },
  { value: 'auto', label: t('settings.mcp.modes.auto') },
])

const statusText = computed(() => {
  if (!supported.value) return t('settings.mcp.status.unsupported')
  if (mode.value === 'off') return t('settings.mcp.status.off')
  if (!bridge.value) return t('settings.mcp.status.starting')
  return t('settings.mcp.status.running', { port: bridge.value.port })
})

function agentStatus(agent: McpAgent): McpAgentStatus | null {
  return agentStatuses.value?.[agent] ?? null
}

async function refreshAgents() {
  if (!desktop.value) return
  try {
    agentStatuses.value = await getMcpAgentStatus()
  } catch (error) {
    agentStatuses.value = null
    const message = String(error)
    agentError.value = { codex: message, claudeCode: message }
  }
}

async function updateAgent(agent: McpAgent, action: 'connect' | 'disconnect', replaceConflict = false) {
  agentBusy.value[agent] = true
  agentError.value[agent] = undefined
  try {
    if (action === 'connect') await connectMcpAgent(agent, replaceConflict)
    else await disconnectMcpAgent(agent)
    confirmingReplacement.value = null
    agentRestartHint.value = agent
    await refreshAgents()
  } catch (error) {
    agentError.value[agent] = String(error)
  } finally {
    agentBusy.value[agent] = false
  }
}

function connectAgent(agent: McpAgent) {
  if (agentStatus(agent)?.kind === 'conflict') {
    confirmingReplacement.value = agent
    return
  }
  void updateAgent(agent, 'connect')
}

async function refreshBridge() {
  try {
    bridge.value = await getMcpBridgeInfo()
  } catch (error) {
    bridge.value = null
    await appLogger.warn({
      source: 'frontend.settings',
      event: 'get_mcp_bridge_info',
      message: 'Failed to read MCP bridge status',
      error,
    })
  }
}

async function setMode(value: string) {
  await workspaceStore.updateSettings((draft) => {
    draft.mcp.mode = value as McpMode
  })
  // The bridge starts or stops in response to the settings change, so give it a
  // moment before reading back the port it ended up on.
  await new Promise(resolve => setTimeout(resolve, 150))
  await refreshBridge()
}

async function setAutoSnapshot(value: boolean) {
  await workspaceStore.updateSettings((draft) => {
    draft.mcp.autoSnapshot = value
  })
}

onMounted(refreshBridge)
watch(activePath, refreshBridge)
watch(desktop, (isDesktop) => {
  if (isDesktop) void refreshAgents()
  else agentStatuses.value = null
}, { immediate: true })
</script>

<template>
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-mcp-panel">
    <SettingsSectionHeader
      :title="t('settings.sections.mcp')"
      :description="t('settings.mcp.description')"
    />

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <SettingsGroup :title="t('settings.mcp.groups.access')">
        <SettingsRow
          :title="t('settings.mcp.mode.title')"
          :description="t('settings.mcp.mode.description')"
        >
          <NvSelect
            :model-value="mode"
            :options="modeOptions"
            :min-width="170"
            :disabled="!supported"
            @update:model-value="setMode"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.mcp.autoSnapshot.title')"
          :description="t('settings.mcp.autoSnapshot.description')"
        >
          <NvToggle
            :model-value="settings.mcp.autoSnapshot"
            :disabled="!supported || !writesAllowed"
            :aria-label="t('settings.mcp.autoSnapshot.title')"
            @update:model-value="setAutoSnapshot"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.mcp.status.title')"
          :description="statusText"
        />
      </SettingsGroup>

      <SettingsGroup :title="t('settings.mcp.groups.connect')">
        <SettingsRow
          :title="t('settings.mcp.connect.title')"
          :description="t('settings.mcp.connect.description')"
        />

        <div class="mcp-agents-list">
          <SettingsMcpAgentCard
            v-for="agent in agents"
            :key="agent"
            :agent="agent"
            :status="agentStatus(agent)"
            :desktop="desktop"
            :busy="Boolean(agentBusy[agent])"
            :error="agentError[agent]"
            :restart-hint="agentRestartHint === agent"
            :is-confirming="confirmingReplacement === agent"
            @connect="connectAgent"
            @disconnect="updateAgent($event, 'disconnect')"
            @replace="updateAgent($event, 'connect', true)"
            @cancel-replace="confirmingReplacement = null"
          />
        </div>
      </SettingsGroup>
    </div>
  </section>
</template>
