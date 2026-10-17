<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
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
import { useAiModels } from '../../../composables/useAiModels'
import SettingsAiApiKeyRow from './SettingsAiApiKeyRow.vue'
import { isOpenRouterUrl, OPENROUTER_BASE_URL } from '../../../core/ai/openrouter'

type ProviderPreset = AIApiKind | 'openrouter'

const OLLAMA_DEFAULT_URL = 'http://localhost:11434'
const OPENAI_DEFAULT_URL = 'http://localhost:1234/v1'
const PROVIDER_DEFAULTS: Record<ProviderPreset, string> = {
  ollama: OLLAMA_DEFAULT_URL,
  openai: OPENAI_DEFAULT_URL,
  openrouter: OPENROUTER_BASE_URL,
}

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { models, status: connectionStatus, load, reset } = useAiModels()
const { settings } = storeToRefs(workspaceStore)
const u = (fn: (draft: WorkspaceSettings) => void) => workspaceStore.updateSettings(fn)

// Local endpoint input ref seeded from settings
const endpointInput = ref(settings.value.ai.baseUrl)

const apiKindOptions = computed(() => [
  { value: 'ollama', label: t('settings.ai.apiKind.ollama') },
  { value: 'openai', label: t('settings.ai.apiKind.openai') },
  { value: 'openrouter', label: t('settings.ai.apiKind.openrouter') },
])

const preset = computed<ProviderPreset>(() => (
  settings.value.ai.apiKind === 'openai' && isOpenRouterUrl(settings.value.ai.baseUrl)
    ? 'openrouter'
    : settings.value.ai.apiKind
))

const aiModelOptions = computed(() => [
  { value: 'llama3', label: t('settings.ai.models.llama3.label'), description: t('settings.ai.models.llama3.description') },
  { value: 'mistral', label: t('settings.ai.models.mistral.label'), description: t('settings.ai.models.mistral.description') },
  { value: 'cloud-gpt', label: t('settings.ai.models.cloudGpt.label'), description: t('settings.ai.models.cloudGpt.description') },
])

const modelSelectOptions = computed(() => {
  if (models.value.length > 0) {
    return models.value.map(m => ({ value: m, label: m }))
  }
  return aiModelOptions.value
})

async function onApiKindChange(v: string) {
  const next = v as ProviderPreset
  const newDefault = PROVIDER_DEFAULTS[next]
  const currentUrl = settings.value.ai.baseUrl
  // A hand-typed endpoint survives switching between the local kinds; the
  // OpenRouter preset is its URL, so choosing it always sets it.
  const shouldAutoFill = next === 'openrouter' || !currentUrl
    || Object.values(PROVIDER_DEFAULTS).includes(currentUrl)
  reset()
  if (shouldAutoFill) {
    endpointInput.value = newDefault
  }
  await u(d => {
    d.ai.apiKind = next === 'openrouter' ? 'openai' : next
    if (shouldAutoFill) {
      d.ai.baseUrl = newDefault
    }
  })
  if (next === 'openrouter') await testConnection()
}

const testConnection = () => load(true)

onMounted(() => {
  if (settings.value.ai.enabled && preset.value === 'openrouter') void load()
})

function onEndpointChange(e: Event) {
  const val = (e.target as HTMLInputElement).value.trim()
  endpointInput.value = val
  u(d => { d.ai.baseUrl = val })
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
          :disabled="!settings.ai.enabled"
        >
          <template #description>
            <template v-if="preset === 'openrouter'">
              <span class="openrouter-notice">{{ t('settings.ai.apiKind.openrouterNotice') }}</span>
              <span v-if="settings.ai.privacyMode" class="openrouter-privacy tw:block tw:text-[var(--warning)]">{{ t('settings.ai.apiKind.openrouterPrivacy') }}</span>
            </template>
            <span v-else>{{ t('settings.ai.apiKind.description') }}</span>
          </template>
          <NvSelect
            :model-value="preset"
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
            class="ai-endpoint-input tw:h-7 tw:min-w-[220px] tw:max-w-[300px] tw:px-2 tw:rounded-[calc(7px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-input-bg tw:text-content-primary tw:font-medium tw:text-xs tw:font-nv-ui tw:outline-none tw:transition-[background-color,box-shadow] tw:duration-[120ms] tw:focus:bg-surface-raised tw:focus:shadow-[0_0_0_2px_var(--input-ring)] tw:disabled:opacity-48 tw:disabled:pointer-events-none tw:placeholder:text-content-muted tw:placeholder:font-normal"
            type="text"
            :disabled="!settings.ai.enabled"
            :value="endpointInput"
            :placeholder="t('settings.ai.endpoint.placeholder')"
            @change="onEndpointChange"
            @blur="onEndpointChange"
          />
        </SettingsRow>

        <!-- API key (OpenAI-compatible only; stored in the OS keychain) -->
        <SettingsAiApiKeyRow :disabled="!settings.ai.enabled || settings.ai.apiKind !== 'openai'" />

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

      </SettingsGroup>
    </div>
  </section>
</template>
