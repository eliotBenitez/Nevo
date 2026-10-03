<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import NvButton from '../../ui/primitives/NvButton.vue'
import NvModal from '../../ui/primitives/NvModal.vue'
import { useAppUpdater } from '../../composables/useAppUpdater'
import { renderReleaseNotesHtml } from '../../utils/releaseNotesMarkdown'
import { systemCommands } from '../../tauri/commands'

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
const panelClass = computed(() => status.value === 'upToDate' ? 'updater-modal--success' : undefined)
const notesHtml = computed(() =>
  releaseNotes.value ? renderReleaseNotesHtml(releaseNotes.value) : '',
)

// Map each non-success status to a glyph + accent so the header reads at a glance.
const headerKind = computed(() => {
  switch (status.value) {
    case 'error':
      return 'error'
    case 'ready':
      return 'ready'
    default:
      return 'update'
  }
})

// Block dismissal while a download is in flight to avoid a half-applied
// update. NvModal funnels the X (unused here, dismissible is false), Escape
// and the backdrop through this same @close handler, so the guard now covers
// every dismissal path instead of only the backdrop.
function handleClose() {
  if (!isDownloading.value) dismiss()
}

function onNotesClick(event: MouseEvent) {
  const anchor = (event.target as Element | null)?.closest('a[href]') as HTMLAnchorElement | null
  if (!anchor) return
  event.preventDefault()
  void systemCommands.openExternalUrl(anchor.href)
}
</script>

<template>
  <NvModal
    :open="dialogOpen"
    size="sm"
    :dismissible="false"
    :panel-class="panelClass"
    labelled-by="updater-modal-title"
    :described-by="status === 'upToDate' ? 'updater-modal-description' : undefined"
    @close="handleClose"
  >
    <template #header>
      <div v-if="status === 'upToDate'" class="updater-modal__success-header">
        <span class="updater-modal__success-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div class="updater-modal__success-copy">
          <h3 id="updater-modal-title" class="updater-modal__title tw:m-0 tw:text-[15px] tw:font-semibold tw:text-content-primary">
            {{ t('updater.upToDateTitle') }}
          </h3>
          <p id="updater-modal-description" class="updater-modal__success-description">
            {{ t('updater.upToDateBody') }}
          </p>
        </div>
      </div>
      <template v-else>
        <span
          class="updater-modal__icon tw:flex-none tw:grid tw:place-items-center tw:size-[38px] tw:rounded-[calc(11px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent"
          :class="headerKind === 'error'
            ? 'updater-modal__icon--error tw:text-[oklch(0.65_0.2_25)] tw:bg-[color-mix(in_oklch,oklch(0.65_0.2_25)_14%,transparent)]'
            : 'tw:text-accent tw:bg-[color-mix(in_oklch,var(--accent,oklch(0.62_0.18_264))_12%,transparent)]'"
          aria-hidden="true"
        >
          <!-- Error -->
          <svg v-if="headerKind === 'error'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
          <!-- Ready to restart -->
          <svg v-else-if="headerKind === 'ready'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
            <path d="M3 3v5h5" />
          </svg>
          <!-- Update available / downloading -->
          <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3v12" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
        </span>

        <div class="updater-modal__heading tw:flex tw:items-baseline tw:gap-2 tw:flex-wrap tw:min-w-0">
          <h3 id="updater-modal-title" class="updater-modal__title tw:m-0 tw:text-[15px] tw:font-semibold tw:text-content-primary">
            <template v-if="status === 'error'">{{ t('updater.errorTitle') }}</template>
            <template v-else-if="status === 'ready'">{{ t('updater.readyTitle') }}</template>
            <template v-else>{{ t('updater.availableTitle', { version: availableVersion }) }}</template>
          </h3>
          <span
            v-if="availableVersion"
            class="updater-modal__version tw:text-[11px] tw:font-semibold tw:tracking-[0.02em] tw:text-accent tw:py-0.5 tw:px-[7px] tw:rounded-full tw:border tw:border-solid tw:border-transparent tw:bg-[color-mix(in_oklch,var(--accent,oklch(0.62_0.18_264))_10%,transparent)]"
          >v{{ availableVersion }}</span>
        </div>
      </template>
    </template>

    <!-- Error -->
    <template v-if="status === 'error'">
      <p class="updater-modal__body tw:m-0 tw:text-[13px] tw:leading-normal tw:text-content-secondary">{{ errorMessage || t('updater.errorBody') }}</p>
      <div class="updater-modal__actions tw:flex tw:justify-end tw:gap-2 tw:mt-0.5">
        <NvButton @click="dismiss">{{ t('updater.close') }}</NvButton>
        <NvButton v-if="availableVersion" variant="primary" @click="downloadAndInstall">
          {{ t('updater.retry') }}
        </NvButton>
      </div>
    </template>

    <!-- Ready to relaunch -->
    <template v-else-if="status === 'ready'">
      <p class="updater-modal__body tw:m-0 tw:text-[13px] tw:leading-normal tw:text-content-secondary">{{ t('updater.readyBody') }}</p>
      <div class="updater-modal__actions tw:flex tw:justify-end tw:gap-2 tw:mt-0.5">
        <NvButton @click="dismiss">{{ t('updater.later') }}</NvButton>
        <NvButton variant="primary" @click="relaunchApp">{{ t('updater.restart') }}</NvButton>
      </div>
    </template>

    <!-- Available / downloading -->
    <template v-else-if="status !== 'upToDate'">
      <div v-if="notesHtml" class="updater-modal__notes-section tw:flex tw:flex-col tw:gap-2">
        <div class="updater-modal__notes-label tw:text-[11px] tw:font-semibold tw:uppercase tw:tracking-[0.05em] tw:text-content-muted">{{ t('updater.whatsNew') }}</div>
        <div class="updater-modal__notes-scroll tw:relative tw:max-h-[240px] tw:overflow-auto tw:rounded-[calc(11px*var(--radius-scale,1))] tw:border tw:border-solid tw:border-transparent tw:bg-surface-subtle">
          <!-- notesHtml is escaped + restricted to our own generated markup -->
          <div class="updater-modal__notes tw:p-3.5 tw:text-[12.5px] tw:leading-[1.55] tw:text-content-secondary tw:break-words" @click="onNotesClick" v-html="notesHtml" />
        </div>
      </div>

      <div v-if="isDownloading" class="updater-modal__progress tw:flex tw:flex-col tw:gap-1.5">
        <div class="updater-modal__progress-track tw:h-1.5 tw:rounded-full tw:bg-surface-subtle tw:overflow-hidden">
          <div class="updater-modal__progress-fill tw:h-full tw:rounded-full tw:bg-accent tw:transition-[width] tw:duration-200 tw:ease-[ease]" :style="{ width: `${progress}%` }" />
        </div>
        <span class="updater-modal__progress-label tw:text-xs tw:text-content-muted">
          {{ t('updater.downloading', { percent: progress }) }}
        </span>
      </div>

      <div class="updater-modal__actions tw:flex tw:justify-end tw:gap-2 tw:mt-0.5">
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
    <template v-if="status === 'upToDate'" #footer>
      <NvButton size="md" @click="dismiss">{{ t('updater.close') }}</NvButton>
    </template>
  </NvModal>
</template>

<style scoped>
.updater-modal__success-header {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.updater-modal__success-icon {
  display: grid;
  flex: 0 0 40px;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: calc(12px * var(--radius-scale, 1));
  color: var(--success);
  background: var(--surface-success);
}

.updater-modal__success-copy {
  min-width: 0;
}

.updater-modal__success-description {
  margin: 6px 0 0;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

:global(.updater-modal--success) {
  width: 100%;
  max-width: 400px;
}

:global(.updater-modal--success .nv-modal__header) {
  align-items: center;
  padding: 24px 24px 0;
}

:global(.updater-modal--success .nv-modal__body) {
  display: none;
}

:global(.updater-modal--success .nv-modal__footer) {
  padding: 16px 24px 24px;
}

@media (max-width: 560px) {
  :global(.updater-modal--success) {
    align-self: center;
    justify-self: center;
    width: calc(100% - 32px);
    margin-inline: 16px;
    border-radius: 16px;
  }

  :global(.updater-modal--success .nv-modal__footer .nv-btn) {
    min-height: 44px;
  }
}

.updater-modal__notes :deep(h4),
.updater-modal__notes :deep(h5) {
  margin: 10px 0 4px;
  color: var(--text-primary);
  font-weight: 650;
}
.updater-modal__notes :deep(h4) { font-size: 13px; }
.updater-modal__notes :deep(h5) { font-size: 12.5px; }
.updater-modal__notes :deep(h4):first-child,
.updater-modal__notes :deep(h5):first-child,
.updater-modal__notes :deep(p):first-child,
.updater-modal__notes :deep(ul):first-child,
.updater-modal__notes :deep(ol):first-child {
  margin-top: 0;
}

.updater-modal__notes :deep(p) {
  margin: 0 0 8px;
}

.updater-modal__notes :deep(ul),
.updater-modal__notes :deep(ol) {
  margin: 0 0 8px;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.updater-modal__notes :deep(li) {
  margin: 0;
}

.updater-modal__notes :deep(li)::marker {
  color: var(--text-muted);
}

.updater-modal__notes :deep(strong) {
  color: var(--text-primary);
  font-weight: 650;
}

.updater-modal__notes :deep(code) {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  padding: 1px 5px;
  border-radius: 5px;
  border: 1px solid transparent;
  background: var(--surface-subtle);
  color: var(--text-primary);
}

.updater-modal__notes :deep(a) {
  color: var(--accent, oklch(0.62 0.18 264));
  text-decoration: none;
}
.updater-modal__notes :deep(a:hover) {
  text-decoration: underline;
}
</style>
