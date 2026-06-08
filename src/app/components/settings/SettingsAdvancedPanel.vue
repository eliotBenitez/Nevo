<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useDeviceLayout } from '../../../composables/useDeviceLayout'
import { appLogger } from '../../../utils/logger'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvToggle from '../../../ui/primitives/NvToggle.vue'

const { t } = useI18n()
const { runtime } = useDeviceLayout()
const workspaceStore = useWorkspaceStore()
const { settings, diagnostics, appMetadata, activePath } = storeToRefs(workspaceStore)

async function revealPath(path: string | undefined) {
  if (!path) return
  try {
    if (!runtime.value.supportsRevealInFileManager) { await openPath(path); return }
    await revealItemInDir(path)
  } catch (error) {
    await appLogger.warn({ source: 'frontend.settings', event: 'reveal_path', message: 'Failed to reveal path', workspacePath: activePath.value, error, payload: { path } })
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
              disabled
            />
            <span class="status-chip status-chip--coming">{{ t('settings.state.coming') }}</span>
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
            <NvButton @click="revealPath(diagnostics?.logsPath ?? appMetadata?.logsPath)">{{ t('settings.advanced.revealLogs.action') }}</NvButton>
          </div>

          <div class="settings-row settings-row--border">
            <div class="row-copy">
              <div class="row-title">{{ t('settings.advanced.rawSettings.title') }}</div>
              <div class="row-sub">{{ t('settings.advanced.rawSettings.description') }}</div>
            </div>
            <NvButton @click="revealPath(diagnostics?.settingsPath)">{{ t('settings.advanced.rawSettings.reveal') }}</NvButton>
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
