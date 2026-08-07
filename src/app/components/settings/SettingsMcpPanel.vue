<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { Check, Copy } from 'lucide-vue-next'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import NvButton from '../../../ui/primitives/NvButton.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import { getMcpBridgeInfo, type McpBridgeInfo } from '../../../tauri/mcp'
import type { McpMode } from '../../../types/workspace'
import { appLogger } from '../../../utils/logger'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings, activePath, backendKind } = storeToRefs(workspaceStore)

const bridge = ref<McpBridgeInfo | null>(null)
const copied = ref(false)

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

const commandSnippet = computed(() =>
  'claude mcp add nevo -- node /path/to/nevo/packages/mcp-server/dist/index.js',
)

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

async function copyCommand() {
  await navigator.clipboard.writeText(commandSnippet.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

onMounted(refreshBridge)
watch(activePath, refreshBridge)
</script>

<template>
  <section class="panel settings-mcp-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.mcp') }}</h2>
        <p class="panel-sub">{{ t('settings.mcp.description') }}</p>
      </div>
    </header>

    <div class="panel-body">
      <div class="group">
        <div class="group-label">{{ t('settings.mcp.groups.access') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.mcp.mode.title') }}</div>
              <div class="row-sub">{{ t('settings.mcp.mode.description') }}</div>
            </div>
            <NvSelect
              :model-value="mode"
              :options="modeOptions"
              :min-width="170"
              :disabled="!supported"
              @update:model-value="setMode"
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.mcp.autoSnapshot.title') }}</div>
              <div class="row-sub">{{ t('settings.mcp.autoSnapshot.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.mcp.autoSnapshot"
              :disabled="!supported || !writesAllowed"
              :aria-label="t('settings.mcp.autoSnapshot.title')"
              @update:model-value="setAutoSnapshot"
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.mcp.status.title') }}</div>
              <div class="row-sub">{{ statusText }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">{{ t('settings.mcp.groups.connect') }}</div>
        <div class="settings-card">
          <div class="settings-row settings-row--stack">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.mcp.connect.title') }}</div>
              <div class="row-sub">{{ t('settings.mcp.connect.description') }}</div>
            </div>
            <div class="mcp-command">
              <code class="mcp-command__text">{{ commandSnippet }}</code>
              <NvButton variant="ghost" @click="copyCommand">
                <Check v-if="copied" :size="14" />
                <Copy v-else :size="14" />
                {{ copied ? t('settings.mcp.connect.copied') : t('settings.mcp.connect.copy') }}
              </NvButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.mcp-command {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.mcp-command__text {
  flex: 1 1 260px;
  min-width: 0;
  overflow-x: auto;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  font-family: var(--font-mono);
  font-size: 12px;
  white-space: nowrap;
}
</style>
