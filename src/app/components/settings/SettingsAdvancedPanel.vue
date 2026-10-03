<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../stores/workspace'
import { appLogger } from '../../../utils/logger'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'
import SettingsGroup from './ui/SettingsGroup.vue'
import SettingsRow from './ui/SettingsRow.vue'
import { systemCommands } from '../../../tauri/commands'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings, activePath, appMetadata } = storeToRefs(workspaceStore)

async function revealLogs() {
  try {
    await systemCommands.openAppLocation('logs', true)
  } catch (error) {
    await appLogger.warn({ source: 'frontend.settings', event: 'reveal_logs', message: 'Failed to reveal logs', workspacePath: activePath.value, error })
  }
}

async function revealSettings() {
  if (!activePath.value) return
  try {
    await systemCommands.openWorkspaceLocation(activePath.value, 'settings', { reveal: true })
  } catch (error) {
    await appLogger.warn({ source: 'frontend.settings', event: 'reveal_settings', message: 'Failed to reveal workspace settings', workspacePath: activePath.value, error })
  }
}
</script>

<template>
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-advanced-panel">
    <SettingsSectionHeader
      :title="t('settings.sections.advanced')"
      :description="t('settings.advanced.description')"
    />

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <SettingsGroup :title="t('settings.advanced.groups.diagnostics')">
        <SettingsRow
          :title="t('settings.advanced.schemaMetadata.title')"
          :description="t('settings.advanced.schemaMetadata.description')"
        >
          <span class="mono-inline tw:text-content-muted tw:text-[11.5px] tw:font-nv-mono">{{ settings.advanced.schemaVersion }}</span>
        </SettingsRow>

        <SettingsRow
          :title="t('settings.advanced.experimentalGraphTools.title')"
          :description="t('settings.advanced.experimentalGraphTools.description')"
        >
          <NvToggle
            :aria-label="t('settings.advanced.experimentalGraphTools.title')"
            :model-value="settings.advanced.experimentalGraphTools"
            @update:model-value="v => workspaceStore.updateSettings(draft => { draft.advanced.experimentalGraphTools = v })"
          />
        </SettingsRow>

        <SettingsRow
          :title="t('settings.advanced.developerLogging.title')"
          :description="t('settings.advanced.developerLogging.description')"
        >
          <NvToggle
            :aria-label="t('settings.advanced.developerLogging.title')"
            :model-value="settings.advanced.developerLogging"
            @update:model-value="v => workspaceStore.updateSettings(draft => { draft.advanced.developerLogging = v })"
          />
        </SettingsRow>

        <SettingsRow
          v-if="appMetadata?.supportsRevealInFileManager"
          :title="t('settings.advanced.revealLogs.title')"
          :description="t('settings.advanced.revealLogs.description')"
        >
          <NvButton @click="revealLogs">{{ t('settings.advanced.revealLogs.action') }}</NvButton>
        </SettingsRow>

        <SettingsRow
          v-if="appMetadata?.supportsRevealInFileManager"
          :title="t('settings.advanced.rawSettings.title')"
          :description="t('settings.advanced.rawSettings.description')"
        >
          <NvButton @click="revealSettings">{{ t('settings.advanced.rawSettings.reveal') }}</NvButton>
        </SettingsRow>

        <SettingsRow
          :title="t('settings.advanced.resetSettings.title')"
          :description="t('settings.advanced.resetSettings.description')"
        >
          <NvButton @click="workspaceStore.resetSettings()">{{ t('settings.advanced.resetSettings.action') }}</NvButton>
        </SettingsRow>
      </SettingsGroup>
    </div>
  </section>
</template>
