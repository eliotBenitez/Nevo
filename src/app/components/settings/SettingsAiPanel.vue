<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvNumberInput from '../../../ui/primitives/NvNumberInput.vue'
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'
import SettingsGroup from './ui/SettingsGroup.vue'
import SettingsRow from './ui/SettingsRow.vue'
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
  if (state === 'functional') return 'status-chip--functional tw:bg-[var(--accent-soft)] tw:text-accent'
  if (state === 'coming') return 'status-chip--coming tw:bg-[var(--surface-warning)] tw:text-[var(--warning)]'
  return 'status-chip--info tw:bg-[var(--hover-strong)] tw:text-content-muted'
}
</script>

<template>
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-ai-panel">
    <SettingsSectionHeader
      :title="t('settings.sections.ai')"
      :description="t('settings.ai.description')"
    />

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <SettingsGroup :title="t('settings.ai.groups.provider')">
        <!-- Master toggle: Enable AI -->
        <SettingsRow
          :title="t('settings.ai.enabled.title')"
          :description="t('settings.ai.enabled.description')"
        >
          <NvToggle
            :aria-label="t('settings.ai.enabled.title')"
            :model-value="settings.ai.enabled"
            @update:model-value="v => u(d => { d.ai.enabled = v })"
          />
        </SettingsRow>

        <!-- API type selector -->
        <SettingsRow
          :title="t('settings.ai.apiKind.title')"
          :description="t('settings.ai.apiKind.description')"
          :disabled="!settings.ai.enabled"
        >
          <NvSelect
            :model-value="settings.ai.apiKind"
            :options="apiKindOptions"
            :min-width="270"
            :disabled="!settings.ai.enabled"
            @update:model-value="onApiKindChange"
          />
        </SettingsRow>

        <!-- Endpoint -->
        <SettingsRow
          :title="t('settings.ai.endpoint.title')"
          :description="t('settings.ai.endpoint.description')"
          :disabled="!settings.ai.enabled"
        >
          <input
            class="ai-endpoint-input tw:h-7 tw:min-w-[220px] tw:max-w-[300px] tw:px-2 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-input-bg tw:text-content-primary tw:font-medium tw:text-xs tw:font-nv-ui tw:outline-none tw:transition-[background-color,box-shadow] tw:duration-[120ms] tw:focus:bg-surface-raised tw:focus:shadow-[0_0_0_2px_var(--input-ring)] disabled:tw:opacity-48 disabled:tw:pointer-events-none tw:placeholder:text-content-muted tw:placeholder:font-normal"
            type="text"
            :disabled="!settings.ai.enabled"
            :value="endpointInput"
            :placeholder="t('settings.ai.endpoint.placeholder')"
            @change="onEndpointChange"
            @blur="onEndpointChange"
          />
        </SettingsRow>

        <!-- Test connection -->
        <SettingsRow
          :title="t('settings.ai.testConnection.button')"
          :disabled="!settings.ai.enabled"
        >
          <template #description>
            <span v-if="connectionStatus === 'idle'">{{ t('settings.ai.endpoint.description') }}</span>
            <span v-else-if="connectionStatus === 'checking'">{{ t('settings.ai.testConnection.checking') }}</span>
            <span v-else-if="connectionStatus === 'ok'" class="connection-ok tw:text-success">{{ t('settings.ai.testConnection.success', { count: models.length }) }}</span>
            <span v-else class="connection-error tw:text-danger">{{ t('settings.ai.testConnection.error') }}</span>
          </template>
          <NvButton
            size="sm"
            :disabled="!settings.ai.enabled"
            :loading="connectionStatus === 'checking'"
            @click="testConnection"
          >
            {{ t('settings.ai.testConnection.button') }}
          </NvButton>
        </SettingsRow>

        <!-- Default model -->
        <SettingsRow
          :title="t('settings.ai.defaultModel.title')"
          :description="t('settings.ai.defaultModel.description')"
          :disabled="!settings.ai.enabled"
        >
          <NvSelect
            :model-value="settings.ai.defaultModel"
            :options="modelSelectOptions"
            :min-width="270"
            :disabled="!settings.ai.enabled"
            @update:model-value="v => u(d => { d.ai.defaultModel = v })"
          />
        </SettingsRow>

        <!-- Privacy mode -->
        <SettingsRow
          :title="t('settings.ai.privacyMode.title')"
          :description="t('settings.ai.privacyMode.description')"
          :disabled="!settings.ai.enabled"
        >
          <NvToggle
            :aria-label="t('settings.ai.privacyMode.title')"
            :model-value="settings.ai.privacyMode"
            :disabled="!settings.ai.enabled"
            @update:model-value="v => u(d => { d.ai.privacyMode = v })"
          />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup :title="t('settings.ai.groups.inlineBehaviour')">
        <SettingsRow
          :title="t('settings.ai.slashCommands.title')"
          :description="t('settings.ai.slashCommands.description')"
          :disabled="!settings.ai.enabled"
        >
          <NvToggle
            :aria-label="t('settings.ai.slashCommands.title')"
            :model-value="settings.ai.slashCommands"
            :disabled="!settings.ai.enabled"
            @update:model-value="v => u(d => { d.ai.slashCommands = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.ai.contextSuggestions.title')"
          :description="t('settings.ai.contextSuggestions.description')"
          :disabled="!settings.ai.enabled"
        >
          <NvToggle
            :aria-label="t('settings.ai.contextSuggestions.title')"
            :model-value="settings.ai.contextualSuggestions"
            :disabled="!settings.ai.enabled"
            @update:model-value="v => u(d => { d.ai.contextualSuggestions = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.ai.streamingOutput.title')"
          :description="t('settings.ai.streamingOutput.description')"
          :disabled="!settings.ai.enabled"
        >
          <NvToggle
            :aria-label="t('settings.ai.streamingOutput.title')"
            :model-value="settings.ai.streamingOutput"
            :disabled="!settings.ai.enabled"
            @update:model-value="v => u(d => { d.ai.streamingOutput = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.ai.maxTokens.title')"
          :description="t('settings.ai.maxTokens.description')"
          :disabled="!settings.ai.enabled"
        >
          <NvNumberInput
            :model-value="settings.ai.maxTokensPerRequest"
            :min="128"
            :max="8192"
            :step="128"
            :disabled="!settings.ai.enabled"
            @update:model-value="v => u(d => { d.ai.maxTokensPerRequest = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.ai.cloudCredentials.title')"
          :description="t('settings.ai.cloudCredentials.description')"
        >
          <span class="status-chip tw:inline-flex tw:h-5 tw:items-center tw:justify-center tw:rounded-full tw:border tw:border-transparent tw:px-2 tw:text-[10.5px] tw:font-semibold" :class="stateClass('coming')">{{ stateLabel('coming') }}</span>
        </SettingsRow>
      </SettingsGroup>
    </div>
  </section>
</template>
