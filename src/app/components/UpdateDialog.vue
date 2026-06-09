<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import NvButton from '../../ui/primitives/NvButton.vue'
import { useAppUpdater } from '../../composables/useAppUpdater'

const { t } = useI18n()
const {
  status,
  progress,
  availableVersion,
  releaseNotes,
  errorMessage,
  dialogOpen,
  downloadAndInstall,
  relaunchApp,
  dismiss,
} = useAppUpdater()

const isDownloading = computed(() => status.value === 'downloading')
// Block dismissal while a download is in flight to avoid a half-applied update.
function onBackdrop() {
  if (!isDownloading.value) dismiss()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="dialogOpen" class="updater-backdrop" @click.self="onBackdrop">
      <div class="updater-modal" role="dialog" aria-modal="true">
        <!-- Up to date -->
        <template v-if="status === 'upToDate'">
          <h3 class="updater-modal__title">{{ t('updater.upToDateTitle') }}</h3>
          <p class="updater-modal__body">{{ t('updater.upToDateBody') }}</p>
          <div class="updater-modal__actions">
            <NvButton variant="primary" @click="dismiss">{{ t('updater.close') }}</NvButton>
          </div>
        </template>

        <!-- Error -->
        <template v-else-if="status === 'error'">
          <h3 class="updater-modal__title">{{ t('updater.errorTitle') }}</h3>
          <p class="updater-modal__body">{{ errorMessage || t('updater.errorBody') }}</p>
          <div class="updater-modal__actions">
            <NvButton @click="dismiss">{{ t('updater.close') }}</NvButton>
            <NvButton variant="primary" @click="downloadAndInstall" v-if="availableVersion">
              {{ t('updater.retry') }}
            </NvButton>
          </div>
        </template>

        <!-- Ready to relaunch -->
        <template v-else-if="status === 'ready'">
          <h3 class="updater-modal__title">{{ t('updater.readyTitle') }}</h3>
          <p class="updater-modal__body">{{ t('updater.readyBody') }}</p>
          <div class="updater-modal__actions">
            <NvButton @click="dismiss">{{ t('updater.later') }}</NvButton>
            <NvButton variant="primary" @click="relaunchApp">{{ t('updater.restart') }}</NvButton>
          </div>
        </template>

        <!-- Available / downloading -->
        <template v-else>
          <h3 class="updater-modal__title">
            {{ t('updater.availableTitle', { version: availableVersion }) }}
          </h3>

          <div v-if="releaseNotes" class="updater-modal__notes-label">{{ t('updater.whatsNew') }}</div>
          <pre v-if="releaseNotes" class="updater-modal__notes">{{ releaseNotes }}</pre>

          <div v-if="isDownloading" class="updater-modal__progress">
            <div class="updater-modal__progress-track">
              <div class="updater-modal__progress-fill" :style="{ width: `${progress}%` }" />
            </div>
            <span class="updater-modal__progress-label">
              {{ t('updater.downloading', { percent: progress }) }}
            </span>
          </div>

          <div class="updater-modal__actions">
            <NvButton :disabled="isDownloading" @click="dismiss">{{ t('updater.later') }}</NvButton>
            <NvButton
              variant="primary"
              :loading="isDownloading"
              :disabled="isDownloading"
              @click="downloadAndInstall"
            >
              {{ t('updater.update') }}
            </NvButton>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.updater-backdrop {
  position: fixed;
  inset: 0;
  background: oklch(0 0 0 / 0.35);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: grid;
  place-items: center;
  z-index: 200;
}

.updater-modal {
  width: min(460px, calc(100vw - 24px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  border-radius: 14px;
  border: 1px solid var(--line-2);
  background: var(--glass-3);
  backdrop-filter: blur(24px) saturate(1.4);
  -webkit-backdrop-filter: blur(24px) saturate(1.4);
  box-shadow: var(--shadow-pop);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.updater-modal__title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--text-1);
}

.updater-modal__body {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
}

.updater-modal__notes-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-3);
}

.updater-modal__notes {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--line-1);
  background: var(--glass-1);
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-2);
}

.updater-modal__progress {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.updater-modal__progress-track {
  height: 6px;
  border-radius: 999px;
  background: var(--glass-1);
  overflow: hidden;
}

.updater-modal__progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--accent, oklch(0.62 0.18 264));
  transition: width 0.2s ease;
}

.updater-modal__progress-label {
  font-size: 12px;
  color: var(--text-3);
}

.updater-modal__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
}
</style>
