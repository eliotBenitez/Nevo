<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import NvButton from '../../ui/primitives/NvButton.vue'
import { useAppUpdater } from '../../composables/useAppUpdater'
import { useFocusTrap } from '../../ui/composables/useFocusTrap'
import { renderReleaseNotesHtml } from '../../utils/releaseNotesMarkdown'

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
const notesHtml = computed(() =>
  releaseNotes.value ? renderReleaseNotesHtml(releaseNotes.value) : '',
)

// Map each status to a glyph + accent so the header reads at a glance.
const headerKind = computed(() => {
  switch (status.value) {
    case 'upToDate':
      return 'success'
    case 'error':
      return 'error'
    case 'ready':
      return 'ready'
    default:
      return 'update'
  }
})

// Block dismissal while a download is in flight to avoid a half-applied update.
function onBackdrop() {
  if (!isDownloading.value) dismiss()
}

function onKeyDown(event: KeyboardEvent) {
  if (!dialogOpen.value || event.key !== 'Escape') return
  if (isDownloading.value) return
  event.preventDefault()
  dismiss()
}

const dialogRef = ref<HTMLElement | null>(null)
const { activate, deactivate } = useFocusTrap(dialogRef, dialogOpen)

watch(dialogOpen, (open) => {
  if (open) {
    document.addEventListener('keydown', onKeyDown)
    nextTick(activate)
  } else {
    document.removeEventListener('keydown', onKeyDown)
    deactivate()
  }
})

onBeforeUnmount(() => document.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <Teleport to="body">
    <Transition name="updater-fade">
      <div v-if="dialogOpen" class="updater-backdrop" @click.self="onBackdrop">
        <div
          ref="dialogRef"
          class="updater-modal"
          :class="`updater-modal--${headerKind}`"
          role="dialog"
          aria-modal="true"
        >
          <header class="updater-modal__header">
            <span class="updater-modal__icon" :class="`updater-modal__icon--${headerKind}`" aria-hidden="true">
              <!-- Up to date -->
              <svg v-if="headerKind === 'success'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <!-- Error -->
              <svg v-else-if="headerKind === 'error'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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

            <div class="updater-modal__heading">
              <h3 class="updater-modal__title">
                <template v-if="status === 'upToDate'">{{ t('updater.upToDateTitle') }}</template>
                <template v-else-if="status === 'error'">{{ t('updater.errorTitle') }}</template>
                <template v-else-if="status === 'ready'">{{ t('updater.readyTitle') }}</template>
                <template v-else>{{ t('updater.availableTitle', { version: availableVersion }) }}</template>
              </h3>
              <span
                v-if="availableVersion && status !== 'upToDate'"
                class="updater-modal__version"
              >v{{ availableVersion }}</span>
            </div>
          </header>

          <!-- Up to date -->
          <template v-if="status === 'upToDate'">
            <p class="updater-modal__body">{{ t('updater.upToDateBody') }}</p>
            <div class="updater-modal__actions">
              <NvButton variant="primary" @click="dismiss">{{ t('updater.close') }}</NvButton>
            </div>
          </template>

          <!-- Error -->
          <template v-else-if="status === 'error'">
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
            <p class="updater-modal__body">{{ t('updater.readyBody') }}</p>
            <div class="updater-modal__actions">
              <NvButton @click="dismiss">{{ t('updater.later') }}</NvButton>
              <NvButton variant="primary" @click="relaunchApp">{{ t('updater.restart') }}</NvButton>
            </div>
          </template>

          <!-- Available / downloading -->
          <template v-else>
            <div v-if="notesHtml" class="updater-modal__notes-section">
              <div class="updater-modal__notes-label">{{ t('updater.whatsNew') }}</div>
              <div class="updater-modal__notes-scroll">
                <!-- notesHtml is escaped + restricted to our own generated markup -->
                <div class="updater-modal__notes" v-html="notesHtml" />
              </div>
            </div>

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
    </Transition>
  </Teleport>
</template>

<style scoped>
.updater-backdrop {
  position: fixed;
  inset: 0;
  background: oklch(0 0 0 / 0.4);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: grid;
  place-items: center;
  z-index: 200;
  padding: 16px;
}

.updater-modal {
  width: min(440px, calc(100vw - 24px));
  max-height: calc(100vh - 48px);
  border-radius: calc(16px * var(--radius-scale, 1));
  border: 1px solid var(--line-2);
  background: var(--glass-3);
  backdrop-filter: blur(28px) saturate(1.4);
  -webkit-backdrop-filter: blur(28px) saturate(1.4);
  box-shadow: var(--shadow-pop);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.updater-modal__header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.updater-modal__icon {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: calc(11px * var(--radius-scale, 1));
  border: 1px solid var(--line-1);
  color: var(--accent, oklch(0.62 0.18 264));
  background: color-mix(in oklch, var(--accent, oklch(0.62 0.18 264)) 12%, transparent);
}

.updater-modal__icon--success {
  color: oklch(0.7 0.16 150);
  background: color-mix(in oklch, oklch(0.7 0.16 150) 14%, transparent);
}

.updater-modal__icon--error {
  color: oklch(0.65 0.2 25);
  background: color-mix(in oklch, oklch(0.65 0.2 25) 14%, transparent);
}

.updater-modal__heading {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.updater-modal__title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--text-1);
}

.updater-modal__version {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--accent, oklch(0.62 0.18 264));
  padding: 2px 7px;
  border-radius: 999px;
  border: 1px solid var(--line-1);
  background: color-mix(in oklch, var(--accent, oklch(0.62 0.18 264)) 10%, transparent);
}

.updater-modal__body {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
}

.updater-modal__notes-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.updater-modal__notes-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-3);
}

.updater-modal__notes-scroll {
  position: relative;
  max-height: 240px;
  overflow: auto;
  border-radius: calc(11px * var(--radius-scale, 1));
  border: 1px solid var(--line-1);
  background: var(--glass-1);
}

.updater-modal__notes {
  padding: 12px 14px;
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-2);
  word-break: break-word;
}

.updater-modal__notes :deep(h4),
.updater-modal__notes :deep(h5) {
  margin: 10px 0 4px;
  color: var(--text-1);
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
  color: var(--text-3);
}

.updater-modal__notes :deep(strong) {
  color: var(--text-1);
  font-weight: 650;
}

.updater-modal__notes :deep(code) {
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: 11.5px;
  padding: 1px 5px;
  border-radius: 5px;
  border: 1px solid var(--line-1);
  background: var(--glass-2);
  color: var(--text-1);
}

.updater-modal__notes :deep(a) {
  color: var(--accent, oklch(0.62 0.18 264));
  text-decoration: none;
}
.updater-modal__notes :deep(a:hover) {
  text-decoration: underline;
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
  margin-top: 2px;
}

.updater-fade-enter-active,
.updater-fade-leave-active {
  transition: opacity 0.18s ease;
}
.updater-fade-enter-from,
.updater-fade-leave-to {
  opacity: 0;
}
.updater-fade-enter-active .updater-modal,
.updater-fade-leave-active .updater-modal {
  transition: transform 0.18s ease;
}
.updater-fade-enter-from .updater-modal,
.updater-fade-leave-to .updater-modal {
  transform: translateY(8px) scale(0.98);
}
</style>
