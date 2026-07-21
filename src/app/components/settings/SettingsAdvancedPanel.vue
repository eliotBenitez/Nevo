<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { useWorkspaceStore } from '../../../stores/workspace'
import { appLogger } from '../../../utils/logger'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'
import { systemCommands } from '../../../tauri/commands'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { settings, activePath } = storeToRefs(workspaceStore)

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
  <section class="panel settings-advanced-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.advanced') }}</h2>
        <p class="panel-sub">{{ t('settings.advanced.description') }}</p>
      </div>
    </header>

    <div class="panel-body">
      <div class="group">
        <div class="group-label">{{ t('settings.advanced.groups.diagnostics') }}</div>
        <div class="settings-card">
          <div class="settings-row">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.advanced.schemaMetadata.title') }}</div>
              <div class="row-sub">{{ t('settings.advanced.schemaMetadata.description') }}</div>
            </div>
            <span class="mono-inline">{{ settings.advanced.schemaVersion }}</span>
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.advanced.experimentalGraphTools.title') }}</div>
              <div class="row-sub">{{ t('settings.advanced.experimentalGraphTools.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.advanced.experimentalGraphTools"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.advanced.experimentalGraphTools = v })"
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.advanced.developerLogging.title') }}</div>
              <div class="row-sub">{{ t('settings.advanced.developerLogging.description') }}</div>
            </div>
            <NvToggle
              :model-value="settings.advanced.developerLogging"
              @update:model-value="v => workspaceStore.updateSettings(draft => { draft.advanced.developerLogging = v })"
            />
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.advanced.revealLogs.title') }}</div>
              <div class="row-sub">{{ t('settings.advanced.revealLogs.description') }}</div>
            </div>
            <NvButton @click="revealLogs">{{ t('settings.advanced.revealLogs.action') }}</NvButton>
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.advanced.rawSettings.title') }}</div>
              <div class="row-sub">{{ t('settings.advanced.rawSettings.description') }}</div>
            </div>
            <NvButton @click="revealSettings">{{ t('settings.advanced.rawSettings.reveal') }}</NvButton>
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.advanced.resetSettings.title') }}</div>
              <div class="row-sub">{{ t('settings.advanced.resetSettings.description') }}</div>
            </div>
            <NvButton @click="workspaceStore.resetSettings()">{{ t('settings.advanced.resetSettings.action') }}</NvButton>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
