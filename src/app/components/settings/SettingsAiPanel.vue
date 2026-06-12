<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvNumberInput from '../../../ui/primitives/NvNumberInput.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { AIApiKind, WorkspaceSettings } from '../../../types/workspace'
import { aiCommands } from '../../../tauri/ai'

type RowState = 'functional' | 'info' | 'coming'
type ConnectionStatus = 'idle' | 'checking' | 'ok' | 'error'

const OLLAMA_DEFAULT_URL = 'http://localhost:11434'
const OPENAI_DEFAULT_URL = 'http://localhost:1234/v1'
const PROVIDER_DEFAULTS: Record<AIApiKind, string> = {
  ollama: OLLAMA_DEFAULT_URL,
  openai: OPENAI_DEFAULT_URL,
}

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings } = storeToRefs(workspaceStore)
const u = (fn: (draft: WorkspaceSettings) => void) => workspaceStore.updateSettings(fn)

// Local endpoint input ref seeded from settings
const endpointInput = ref(settings.value.ai.baseUrl)

const apiKindOptions = computed(() => [
  { value: 'ollama', label: t('settings.ai.apiKind.ollama') },
  { value: 'openai', label: t('settings.ai.apiKind.openai') },
])

const aiModelOptions = computed(() => [
  { value: 'llama3', label: t('settings.ai.models.llama3.label'), description: t('settings.ai.models.llama3.description') },
  { value: 'mistral', label: t('settings.ai.models.mistral.label'), description: t('settings.ai.models.mistral.description') },
  { value: 'cloud-gpt', label: t('settings.ai.models.cloudGpt.label'), description: t('settings.ai.models.cloudGpt.description') },
])

const models = ref<string[]>([])
const connectionStatus = ref<ConnectionStatus>('idle')

const modelSelectOptions = computed(() => {
  if (models.value.length > 0) {
    return models.value.map(m => ({ value: m, label: m }))
  }
  return aiModelOptions.value
})

function onApiKindChange(v: string) {
  const newKind = v as AIApiKind
  const newDefault = PROVIDER_DEFAULTS[newKind]
  const otherDefault = newKind === 'ollama' ? OPENAI_DEFAULT_URL : OLLAMA_DEFAULT_URL
  const currentUrl = settings.value.ai.baseUrl
  const shouldAutoFill = !currentUrl || currentUrl === otherDefault
  u(d => {
    d.ai.apiKind = newKind
    if (shouldAutoFill) {
      d.ai.baseUrl = newDefault
    }
  })
  if (shouldAutoFill) {
    endpointInput.value = newDefault
  }
}

async function testConnection() {
  connectionStatus.value = 'checking'
  try {
    const result = await aiCommands.listModels(settings.value.ai.baseUrl, settings.value.ai.apiKind)
    models.value = result
    connectionStatus.value = 'ok'
  } catch {
    models.value = []
    connectionStatus.value = 'error'
  }
}

function onEndpointChange(e: Event) {
  const val = (e.target as HTMLInputElement).value.trim()
  endpointInput.value = val
  u(d => { d.ai.baseUrl = val })
}

function stateLabel(state: RowState): string {
  if (state === 'functional') return t('settings.state.functional')
  if (state === 'coming') return t('settings.state.coming')
  return t('settings.state.info')
}

function stateClass(state: RowState): string {
  if (state === 'functional') return 'status-chip--functional'
  if (state === 'coming') return 'status-chip--coming'
  return 'status-chip--info'
}
</script>

<template>
  <section class="panel settings-ai-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.ai') }}</h2>
        <p class="panel-sub">{{ t('settings.ai.description') }}</p>
      </div>
    </header>

    <div class="panel-body">
      <div class="group">
        <div class="group-label">{{ t('settings.ai.groups.provider') }}</div>
        <div class="settings-card">

          <!-- Master toggle: Enable AI -->
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.enabled.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.enabled.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.ai.enabled"
              @update:model-value="v => u(d => { d.ai.enabled = v })"
            />
          </div>

          <!-- API type selector -->
          <div class="settings-row settings-row--border" :class="{ 'settings-row--muted': !settings.ai.enabled }">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.apiKind.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.apiKind.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.ai.apiKind"
              :options="apiKindOptions"
              :min-width="270"
              :disabled="!settings.ai.enabled"
              @update:model-value="onApiKindChange"
            />
          </div>

          <!-- Endpoint -->
          <div class="settings-row settings-row--border" :class="{ 'settings-row--muted': !settings.ai.enabled }">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.endpoint.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.endpoint.description') }}</div>
            </div>
            <input
              class="ai-endpoint-input"
              type="text"
              :disabled="!settings.ai.enabled"
              :value="endpointInput"
              :placeholder="t('settings.ai.endpoint.placeholder')"
              @change="onEndpointChange"
              @blur="onEndpointChange"
            />
          </div>

          <!-- Test connection -->
          <div class="settings-row settings-row--border" :class="{ 'settings-row--muted': !settings.ai.enabled }">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.testConnection.button') }}</div>
              <div class="row-sub">
                <span v-if="connectionStatus === 'idle'" />
                <span v-else-if="connectionStatus === 'checking'">{{ t('settings.ai.testConnection.checking') }}</span>
                <span v-else-if="connectionStatus === 'ok'" class="connection-ok">{{ t('settings.ai.testConnection.success', { count: models.length }) }}</span>
                <span v-else class="connection-error">{{ t('settings.ai.testConnection.error') }}</span>
              </div>
            </div>
            <NvButton
              size="sm"
              :disabled="!settings.ai.enabled"
              :loading="connectionStatus === 'checking'"
              @click="testConnection"
            >
              {{ t('settings.ai.testConnection.button') }}
            </NvButton>
          </div>

          <!-- Default model -->
          <div class="settings-row settings-row--border" :class="{ 'settings-row--muted': !settings.ai.enabled }">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.defaultModel.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.defaultModel.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.ai.defaultModel"
              :options="modelSelectOptions"
              :min-width="270"
              :disabled="!settings.ai.enabled"
              @update:model-value="v => u(d => { d.ai.defaultModel = v })"
            />
          </div>

          <!-- Privacy mode -->
          <div class="settings-row settings-row--border" :class="{ 'settings-row--muted': !settings.ai.enabled }">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.privacyMode.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.privacyMode.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.ai.privacyMode"
              :disabled="!settings.ai.enabled"
              @update:model-value="v => u(d => { d.ai.privacyMode = v })"
            />
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">{{ t('settings.ai.groups.inlineBehaviour') }}</div>
        <div class="settings-card">
          <div class="settings-row" :class="{ 'settings-row--muted': !settings.ai.enabled }">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.slashCommands.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.slashCommands.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.ai.slashCommands"
              :disabled="!settings.ai.enabled"
              @update:model-value="v => u(d => { d.ai.slashCommands = v })"
            />
          </div>

          <div class="settings-row settings-row--border" :class="{ 'settings-row--muted': !settings.ai.enabled }">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.contextSuggestions.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.contextSuggestions.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.ai.contextualSuggestions"
              :disabled="!settings.ai.enabled"
              @update:model-value="v => u(d => { d.ai.contextualSuggestions = v })"
            />
          </div>

          <div class="settings-row settings-row--border" :class="{ 'settings-row--muted': !settings.ai.enabled }">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.streamingOutput.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.streamingOutput.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.ai.streamingOutput"
              :disabled="!settings.ai.enabled"
              @update:model-value="v => u(d => { d.ai.streamingOutput = v })"
            />
          </div>

          <div class="settings-row settings-row--border" :class="{ 'settings-row--muted': !settings.ai.enabled }">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.maxTokens.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.maxTokens.description') }}</div>
            </div>
            <NvNumberInput
              :model-value="settings.ai.maxTokensPerRequest"
              :min="128"
              :max="8192"
              :step="128"
              :disabled="!settings.ai.enabled"
              @update:model-value="v => u(d => { d.ai.maxTokensPerRequest = v })"
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.cloudCredentials.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.cloudCredentials.description') }}</div>
            </div>
            <span class="status-chip" :class="stateClass('coming')">{{ stateLabel('coming') }}</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ai-endpoint-input {
  height: 28px;
  min-width: 220px;
  max-width: 300px;
  padding: 0 8px;
  border-radius: calc(7px * var(--radius-scale, 1));
  border: 1px solid var(--line-2);
  background: var(--glass-3, var(--surface-1));
  color: var(--text-1);
  font: 500 12px var(--font-ui);
  outline: none;
  transition: border-color 0.12s, box-shadow 0.12s;
}

.ai-endpoint-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.ai-endpoint-input:disabled {
  opacity: 0.48;
  pointer-events: none;
}

.ai-endpoint-input::placeholder {
  color: var(--text-4);
  font-weight: 400;
}

.connection-ok {
  color: var(--color-success, oklch(0.68 0.09 160));
}

.connection-error {
  color: var(--color-danger, oklch(0.65 0.16 25));
}
</style>
