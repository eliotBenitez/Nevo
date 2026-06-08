<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { openPath, openUrl, revealItemInDir } from '@tauri-apps/plugin-opener'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useDeviceLayout } from '../../../composables/useDeviceLayout'
import { appLogger } from '../../../utils/logger'
import NvButton from '../../../ui/primitives/NvButton.vue'

const { t } = useI18n()
const { runtime } = useDeviceLayout()
const workspaceStore = useWorkspaceStore()
const { manifest, appMetadata, diagnostics, activePath } = storeToRefs(workspaceStore)

async function revealPath(path: string | undefined) {
  if (!path) return
  try {
    if (!runtime.value.supportsRevealInFileManager) {
      await openPath(path)
      return
    }
    await revealItemInDir(path)
  } catch (error) {
    await appLogger.warn({ source: 'frontend.settings', event: 'reveal_path', message: 'Failed to reveal path', workspacePath: activePath.value, error, payload: { path } })
  }
}

async function openFolder(path: string | undefined) {
  if (!path) return
  try {
    await openPath(path)
  } catch (error) {
    try { await revealItemInDir(path); return } catch {}
    await appLogger.warn({ source: 'frontend.settings', event: 'open_folder', message: 'Failed to open folder', workspacePath: activePath.value, error, payload: { path } })
  }
}

async function openExternalUrl(url: string) {
  try {
    await openUrl(url)
  } catch (error) {
    await appLogger.warn({ source: 'frontend.settings', event: 'open_external_url', message: 'Failed to open URL', workspacePath: activePath.value, error, payload: { url } })
  }
}
</script>

<template>
  <section class="panel settings-about-panel">
    <header class="panel-header">
      <div>
        <h2 class="panel-title">{{ t('settings.sections.about') }}</h2>
        <p class="panel-sub">{{ t('settings.about.description') }}</p>
      </div>
    </header>

    <div class="panel-body">
      <div class="about-hero">
        <div class="about-mark"><em>{{ manifest?.glyph || 'N' }}</em></div>
        <div class="about-copy">
          <div class="about-name"><em>Nevo</em></div>
          <p class="about-tagline">{{ t('settings.about.tagline') }}</p>

          <div class="meta-grid">
            <div class="meta-key">{{ t('settings.about.meta.version') }}</div>
            <div class="meta-value mono">{{ appMetadata?.version ?? '0.1.0' }}</div>
            <div class="meta-key">{{ t('settings.about.meta.engine') }}</div>
            <div class="meta-value mono">{{ appMetadata?.engine ?? 'Tauri 2' }}</div>
            <div class="meta-key">{{ t('settings.about.meta.platform') }}</div>
            <div class="meta-value mono">{{ appMetadata?.platform ?? t('settings.common.desktop') }}</div>
            <div class="meta-key">{{ t('settings.about.meta.workspace') }}</div>
            <div class="meta-value mono">{{ diagnostics?.workspacePath ?? t('settings.about.notAvailable') }}</div>
          </div>

          <div class="about-actions">
            <NvButton variant="primary" disabled>{{ t('settings.about.actions.checkUpdates') }}</NvButton>
            <NvButton @click="revealPath(appMetadata?.configPath)">{{ t('settings.about.actions.revealConfig') }}</NvButton>
            <NvButton @click="openFolder(appMetadata?.appDataDir)">{{ t('settings.about.actions.openUserFolder') }}</NvButton>
            <NvButton @click="openExternalUrl('https://tauri.app')">{{ t('settings.about.actions.acknowledgements') }}</NvButton>
          </div>
        </div>
      </div>

      <div class="oss-card">
        <div class="oss-card__title">{{ t('settings.about.openSourceTitle') }}</div>
        <div class="oss-card__body">{{ t('settings.about.openSourceBody') }}</div>
      </div>
    </div>
  </section>
</template>
