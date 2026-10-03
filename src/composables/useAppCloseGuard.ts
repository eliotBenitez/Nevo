import { onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useNoteStore } from '../stores/note'
import { confirm } from '../ui/composables/useConfirmDialog'
import { appLogger } from '../utils/logger'
import { finalizeActiveRecording } from '../core/voice-recording/activeRecording'

// The native window close is intercepted in Rust (`WindowEvent::CloseRequested`),
// which prevents the default close and emits this event. We flush all pending
// writes (editor content → `note.json` via `flushDurably`), then tell Rust it
// is safe to close. Without this, an async `beforeunload` handler cannot
// finish its IPC before the webview is torn down, so the last edits within
// the autosave debounce window are lost on quit.
const BEFORE_CLOSE_EVENT = 'nevo://close-requested'
// A wedged flush must not block quitting forever: past this bound we treat it
// as a failure (unlike the old fire-and-forget close, this no longer means
// "proceed anyway" — it falls into the same failed-flush path as a real error,
// so the user is asked before anything is lost).
// Must exceed CloudSession.flushDurability's relay-drain bound (5 s).
const CLOSE_FLUSH_TIMEOUT_MS = 8_000

type FlushResult = { ok: true } | { ok: false; error: unknown }

function withTimeout(promise: Promise<FlushResult>, ms: number): Promise<FlushResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ ok: false, error: new Error('timeout') }), ms)
    promise.then((result) => {
      clearTimeout(timer)
      resolve(result)
    })
  })
}

export function useAppCloseGuard() {
  const noteStore = useNoteStore()
  const { t } = useI18n()
  let unlisten: (() => void) | null = null
  let closing = false
  // Guards against a second close-request event arriving while the
  // save-failed dialog is already open (closing is deliberately reset to
  // false before the dialog opens so a *stuck* flush can be retried).
  let dialogOpen = false

  async function allowClose() {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('allow_app_close')
    } catch (error) {
      // The window stays open if this fails; reset so a later close attempt
      // (the user trying again) is not silently ignored.
      closing = false
      await appLogger.error({
        source: 'frontend.app',
        event: 'before_close_allow',
        message: 'Failed to tell the backend it may close the window',
        error,
      })
    }
  }

  async function flushAndClose() {
    if (closing || dialogOpen) return
    closing = true
    await finalizeActiveRecording()

    const result = await withTimeout(noteStore.flushDurably(), CLOSE_FLUSH_TIMEOUT_MS)

    if (result.ok) {
      await allowClose()
      return
    }

    await appLogger.error({
      source: 'frontend.app',
      event: 'before_close_flush',
      message: 'Failed to durably flush pending writes before window close',
      error: result.error,
    })

    closing = false
    dialogOpen = true
    let closeAnyway: boolean
    try {
      closeAnyway = await confirm({
        title: t('closeGuard.saveFailedTitle'),
        message: t('closeGuard.saveFailedMessage'),
        confirmLabel: t('closeGuard.closeAnyway'),
        cancelLabel: t('closeGuard.stay'),
        variant: 'danger',
      })
    } finally {
      dialogOpen = false
    }

    if (closeAnyway) {
      closing = true
      await allowClose()
    }
  }

  onMounted(async () => {
    try {
      const { listen } = await import('@tauri-apps/api/event')
      unlisten = await listen(BEFORE_CLOSE_EVENT, () => {
        void flushAndClose()
      })
    } catch {
      /* Non-Tauri context (e.g. unit tests): no window lifecycle to guard. */
    }
  })

  onUnmounted(() => {
    unlisten?.()
    unlisten = null
  })
}
