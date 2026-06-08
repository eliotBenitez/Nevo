<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import NvSelect from '../../../ui/primitives/NvSelect.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import { useWorkspaceStore } from '../../../stores/workspace'
import type { AppLocale } from '../../../types/workspace'

type RowState = 'functional' | 'info' | 'coming'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings, appConfig } = storeToRefs(workspaceStore)

const languageOptions = computed<Array<{ value: AppLocale; label: string }>>(() => [
  { value: 'ru', label: t('settings.options.language.ru') },
  { value: 'en', label: t('settings.options.language.en') },
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
  <section class="panel settings-general-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.general') }}</h2>
        <p class="panel-sub">{{ t('settings.general.description') }}</p>
      </div>
    </header>

    <div class="panel-body">
      <div class="group">
        <div class="group-label">{{ t('settings.general.groups.application') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.general.language.title') }}</div>
              <div class="row-sub">{{ t('settings.general.language.description') }}</div>
            </div>
            <NvSelect
              :model-value="appConfig.locale"
              :options="languageOptions"
              :min-width="140"
              @update:model-value="workspaceStore.setAppLocale($event as AppLocale)"
            />
          </div>
        </div>
      </div>

      <div class="group">
        <div class="group-label">{{ t('settings.general.groups.startup') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.general.startupView.title') }}</div>
              <div class="row-sub">{{ t('settings.general.startupView.description') }}</div>
            </div>
            <span class="status-chip" :class="stateClass('coming')">{{ stateLabel('coming') }}</span>
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.general.restoreLastContext.title') }}</div>
              <div class="row-sub">{{ t('settings.general.restoreLastContext.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.general.restoreLastContext"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.general.restoreLastContext = v })"
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.general.deleteConfirmations.title') }}</div>
              <div class="row-sub">{{ t('settings.general.deleteConfirmations.panelDescription') }}</div>
            </div>
            <NvToggle
              :model-value="settings.general.confirmBeforeDelete"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.general.confirmBeforeDelete = v })"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
