import { readonly, ref } from 'vue'
import { isTauri } from '@tauri-apps/api/core'
import type { DownloadEvent, Update } from '@tauri-apps/plugin-updater'
import { appLogger } from '../utils/logger'

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'upToDate'
  | 'error'

// Module-level singleton state so the silent startup check and the manual
// "Check for updates" button in settings share the same flow and dialog.
const status = ref<UpdaterStatus>('idle')
const progress = ref(0)
const availableVersion = ref<string | null>(null)
const releaseNotes = ref<string | null>(null)
const releaseDate = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const dialogOpen = ref(false)

// The pending Update handle is kept outside Vue reactivity on purpose.
let pendingUpdate: Update | null = null
let downloadedBytes = 0
let totalBytes = 0

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Check the configured endpoint for a newer release.
 * `silent` (used at startup) suppresses the dialog when the app is up to date
 * or the check fails; a manual check always surfaces the result.
 * Returns true when an update is available.
 */
async function check({ silent = false }: { silent?: boolean } = {}): Promise<boolean> {
  if (!isTauri()) return false
  if (status.value === 'checking' || status.value === 'downloading') {
    return availableVersion.value != null
  }

  status.value = 'checking'
  errorMessage.value = null

  try {
    const { check: checkUpdate } = await import('@tauri-apps/plugin-updater')
    const update = await checkUpdate()

    if (update) {
      pendingUpdate = update
      availableVersion.value = update.version
      releaseNotes.value = update.body?.trim() ? update.body : null
      releaseDate.value = update.date ?? null
      status.value = 'available'
      dialogOpen.value = true
      await appLogger.info({
        source: 'frontend.updater',
        event: 'available',
        message: 'Update available',
        payload: { version: update.version },
      })
      return true
    }

    pendingUpdate = null
    availableVersion.value = null
    releaseNotes.value = null
    status.value = 'upToDate'
    if (!silent) dialogOpen.value = true
    return false
  } catch (error) {
    pendingUpdate = null
    status.value = 'error'
    errorMessage.value = describeError(error)
    await appLogger.warn({
      source: 'frontend.updater',
      event: 'check',
      message: 'Update check failed',
      error,
    })
    if (!silent) dialogOpen.value = true
    return false
  }
}

/** Download and install the pending update, tracking progress 0–100. */
async function downloadAndInstall(): Promise<void> {
  if (!pendingUpdate) return

  status.value = 'downloading'
  progress.value = 0
  downloadedBytes = 0
  totalBytes = 0

  try {
    await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
      switch (event.event) {
        case 'Started':
          totalBytes = event.data.contentLength ?? 0
          break
        case 'Progress':
          downloadedBytes += event.data.chunkLength
          progress.value =
            totalBytes > 0 ? Math.min(100, Math.round((downloadedBytes / totalBytes) * 100)) : 0
          break
        case 'Finished':
          progress.value = 100
          break
      }
    })

    status.value = 'ready'
    await appLogger.info({
      source: 'frontend.updater',
      event: 'installed',
      message: 'Update downloaded and installed',
      payload: { version: availableVersion.value },
    })
  } catch (error) {
    status.value = 'error'
    errorMessage.value = describeError(error)
    await appLogger.error({
      source: 'frontend.updater',
      event: 'install',
      message: 'Update install failed',
      error,
    })
  }
}

/** Restart the app to boot into the freshly installed version. */
async function relaunchApp(): Promise<void> {
  try {
    const { relaunch } = await import('@tauri-apps/plugin-process')
    await relaunch()
  } catch (error) {
    status.value = 'error'
    errorMessage.value = describeError(error)
    await appLogger.error({
      source: 'frontend.updater',
      event: 'relaunch',
      message: 'Failed to relaunch after update',
      error,
    })
  }
}

/** Close the dialog and reset transient terminal states. */
function dismiss(): void {
  dialogOpen.value = false
  if (status.value === 'upToDate' || status.value === 'error') {
    status.value = 'idle'
  }
}

export function useAppUpdater() {
  return {
    status: readonly(status),
    progress: readonly(progress),
    availableVersion: readonly(availableVersion),
    releaseNotes: readonly(releaseNotes),
    releaseDate: readonly(releaseDate),
    errorMessage: readonly(errorMessage),
    dialogOpen,
    check,
    downloadAndInstall,
    relaunchApp,
    dismiss,
  }
}
