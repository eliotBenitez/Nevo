<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import { useWorkspaceStore } from '../../../stores/workspace'

type RowState = 'functional' | 'info' | 'coming'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings } = storeToRefs(workspaceStore)

const aiModelOptions = computed(() => [
  { value: 'llama3', label: t('settings.ai.models.llama3.label'), description: t('settings.ai.models.llama3.description') },
  { value: 'mistral', label: t('settings.ai.models.mistral.label'), description: t('settings.ai.models.mistral.description') },
  { value: 'cloud-gpt', label: t('settings.ai.models.cloudGpt.label'), description: t('settings.ai.models.cloudGpt.description') },
])

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
      <span class="status-chip status-chip--coming">{{ t('settings.state.coming') }}</span>
    </header>

    <div class="panel-body">
      <div class="group">
        <div class="group-label">{{ t('settings.ai.groups.provider') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.defaultModel.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.defaultModel.description') }}</div>
            </div>
            <NvSelect
              :model-value="settings.ai.defaultModel"
              :options="aiModelOptions"
              :min-width="270"
              disabled
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.privacyMode.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.privacyMode.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.ai.privacyMode"
              disabled
            />
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">{{ t('settings.ai.groups.inlineBehaviour') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.slashCommands.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.slashCommands.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.ai.slashCommands"
              disabled
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.contextSuggestions.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.contextSuggestions.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.ai.contextualSuggestions"
              disabled
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.ai.streamingOutput.title') }}</div>
              <div class="row-sub">{{ t('settings.ai.streamingOutput.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.ai.streamingOutput"
              disabled
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
