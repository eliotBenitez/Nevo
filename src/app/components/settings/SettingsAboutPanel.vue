<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { Cpu, ExternalLink, FolderOpen, HardDrive, Monitor, RefreshCw, Settings } from 'lucide-vue-next'
import { useWorkspaceStore } from '../../../stores/workspace'
import { useAppUpdater } from '../../../composables/useAppUpdater'
import { appLogger } from '../../../utils/logger'
import NvButton from '../../../ui/primitives/NvButton.vue'
import NvNoteIcon from '../../../ui/primitives/NvNoteIcon.vue'
import SettingsSectionHeader from './ui/SettingsSectionHeader.vue'
import { systemCommands, type AppLocation } from '../../../tauri/commands'
import { formatWorkspacePath } from '../../../utils/workspacePath'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const { manifest, appMetadata, diagnostics, activePath } = storeToRefs(workspaceStore)

const { status: updaterStatus, check: checkForUpdates } = useAppUpdater()
const isChecking = computed(() => updaterStatus.value === 'checking')
const workspacePath = computed(() => diagnostics.value?.workspacePath
  ? formatWorkspacePath(diagnostics.value.workspacePath, appMetadata.value?.platform)
  : t('settings.about.notAvailable'))

async function onCheckUpdates() {
  await checkForUpdates({ silent: false })
}

async function openAppLocation(location: AppLocation, reveal = false) {
  try {
    await systemCommands.openAppLocation(location, reveal)
  } catch (error) {
    await appLogger.warn({ source: 'frontend.settings', event: 'open_app_location', message: 'Failed to open application location', workspacePath: activePath.value, error, payload: { location, reveal } })
  }
}

async function openExternalUrl(url: string) {
  try {
    await systemCommands.openExternalUrl(url)
  } catch (error) {
    await appLogger.warn({ source: 'frontend.settings', event: 'open_external_url', message: 'Failed to open URL', workspacePath: activePath.value, error, payload: { url } })
  }
}
</script>

<template>
  <section class="panel tw:flex tw:h-full tw:min-h-0 tw:flex-col settings-about-panel">
    <SettingsSectionHeader
      :title="t('settings.sections.about')"
      :description="t('settings.about.description')"
    />

    <div class="panel-body tw:flex tw:min-h-0 tw:flex-1 tw:flex-col tw:gap-5 tw:overflow-auto tw:overscroll-contain tw:px-[30px] tw:pt-[18px] tw:pb-[30px]">
      <div class="about-hero tw:flex tw:items-start tw:gap-6 tw:rounded-[calc(14px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-[18px] tw:max-[980px]:flex-col tw:max-[980px]:items-stretch">
        <div class="about-mark tw:grid tw:size-[88px] tw:place-items-center tw:rounded-[calc(22px*var(--radius-scale,1))] tw:bg-accent tw:text-content-on-accent"><em class="tw:flex tw:items-center tw:justify-center tw:text-white tw:[font-family:var(--font-serif)] tw:text-[44px] tw:italic"><NvNoteIcon :value="manifest?.glyph || 'N'" :size="48" /></em></div>
        <div class="about-copy tw:min-w-0 tw:flex-1">
          <div class="about-name tw:text-content-primary tw:[font-family:var(--font-serif)] tw:text-4xl tw:font-normal"><em class="tw:italic">Nevo</em></div>
          <p class="about-tagline tw:mt-2 tw:mb-0 tw:max-w-[520px] tw:text-content-muted tw:text-[13px] tw:leading-[1.55]">{{ t('settings.about.tagline') }}</p>

          <div class="meta-grid tw:mt-[18px] tw:grid tw:grid-cols-[auto_1fr] tw:gap-x-[22px] tw:gap-y-1.5">
            <div class="meta-key tw:text-content-muted tw:text-xs">{{ t('settings.about.meta.version') }}</div>
            <div class="meta-value mono tw:text-content-muted tw:text-[11.5px] tw:font-nv-mono tw:[overflow-wrap:anywhere]">{{ appMetadata?.version ?? '0.1.0' }}</div>
            <div class="meta-key tw:text-content-muted tw:text-xs">{{ t('settings.about.meta.engine') }}</div>
            <div class="meta-value mono tw:text-content-muted tw:text-[11.5px] tw:font-nv-mono tw:[overflow-wrap:anywhere]">{{ appMetadata?.engine ?? 'Tauri 2' }}</div>
            <div class="meta-key tw:text-content-muted tw:text-xs">{{ t('settings.about.meta.platform') }}</div>
            <div class="meta-value mono tw:text-content-muted tw:text-[11.5px] tw:font-nv-mono tw:[overflow-wrap:anywhere]">{{ appMetadata?.platform ?? t('settings.common.desktop') }}</div>
            <div class="meta-key tw:text-content-muted tw:text-xs">{{ t('settings.about.meta.workspace') }}</div>
            <div class="meta-value mono tw:text-content-muted tw:text-[11.5px] tw:font-nv-mono tw:[overflow-wrap:anywhere]">{{ workspacePath }}</div>
          </div>

          <div class="about-actions tw:mt-5 tw:flex tw:flex-wrap tw:items-center tw:gap-2">
            <NvButton variant="primary" :loading="isChecking" :disabled="isChecking" @click="onCheckUpdates">
              <RefreshCw :size="14" />
              {{ isChecking ? t('updater.checking') : t('settings.about.actions.checkUpdates') }}
            </NvButton>
            <NvButton @click="openAppLocation('config', true)">
              <Settings :size="14" />
              {{ t('settings.about.actions.revealConfig') }}
            </NvButton>
            <NvButton @click="openAppLocation('appData')">
              <FolderOpen :size="14" />
              {{ t('settings.about.actions.openUserFolder') }}
            </NvButton>
            <NvButton @click="openExternalUrl('https://tauri.app')">
              <ExternalLink :size="14" />
              {{ t('settings.about.actions.acknowledgements') }}
            </NvButton>
          </div>
        </div>
      </div>

      <div class="about-diagnostics tw:grid tw:grid-cols-3 tw:gap-2.5 tw:max-[980px]:grid-cols-1">
        <div class="about-diagnostic-card tw:grid tw:min-w-0 tw:grid-cols-[auto_minmax(0,1fr)] tw:items-center tw:gap-x-2 tw:gap-y-2 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-[14px]">
          <Cpu :size="15" class="tw:text-accent" />
          <span class="tw:min-w-0 tw:overflow-hidden tw:text-content-muted tw:text-[10.5px] tw:font-[650] tw:tracking-[0.08em] tw:text-ellipsis tw:whitespace-nowrap tw:uppercase">{{ t('settings.about.meta.engine') }}</span>
          <strong class="tw:col-span-full tw:text-content-primary tw:text-xs tw:font-[550] tw:[overflow-wrap:anywhere]">{{ appMetadata?.engine ?? 'Tauri 2' }}</strong>
        </div>
        <div class="about-diagnostic-card tw:grid tw:min-w-0 tw:grid-cols-[auto_minmax(0,1fr)] tw:items-center tw:gap-x-2 tw:gap-y-2 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-[14px]">
          <Monitor :size="15" class="tw:text-accent" />
          <span class="tw:min-w-0 tw:overflow-hidden tw:text-content-muted tw:text-[10.5px] tw:font-[650] tw:tracking-[0.08em] tw:text-ellipsis tw:whitespace-nowrap tw:uppercase">{{ t('settings.about.meta.platform') }}</span>
          <strong class="tw:col-span-full tw:text-content-primary tw:text-xs tw:font-[550] tw:[overflow-wrap:anywhere]">{{ appMetadata?.platform ?? t('settings.common.desktop') }}</strong>
        </div>
        <div class="about-diagnostic-card tw:grid tw:min-w-0 tw:grid-cols-[auto_minmax(0,1fr)] tw:items-center tw:gap-x-2 tw:gap-y-2 tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:p-[14px]">
          <HardDrive :size="15" class="tw:text-accent" />
          <span class="tw:min-w-0 tw:overflow-hidden tw:text-content-muted tw:text-[10.5px] tw:font-[650] tw:tracking-[0.08em] tw:text-ellipsis tw:whitespace-nowrap tw:uppercase">{{ t('settings.about.meta.workspace') }}</span>
          <strong class="tw:col-span-full tw:text-content-primary tw:text-xs tw:font-[550] tw:[overflow-wrap:anywhere]">{{ workspacePath }}</strong>
        </div>
      </div>

      <div class="oss-card tw:rounded-[calc(12px*var(--radius-scale,1))] tw:border tw:border-transparent tw:bg-surface-subtle tw:px-5 tw:py-4">
        <div class="oss-card__title tw:text-content-primary tw:text-[13.5px] tw:font-[560]">{{ t('settings.about.openSourceTitle') }}</div>
        <div class="oss-card__body tw:mt-1 tw:text-content-muted tw:text-xs tw:leading-[1.55]">{{ t('settings.about.openSourceBody') }}</div>
      </div>
    </div>
  </section>
</template>
