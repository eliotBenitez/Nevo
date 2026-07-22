import { onMounted, onUnmounted } from 'vue'
import { useNoteStore } from '../stores/note'
import { appLogger } from '../utils/logger'

// The native window close is intercepted in Rust (`WindowEvent::CloseRequested`),
// which prevents the default close and emits this event. We flush all pending
// writes (editor content → note.json and the authoritative Y.Doc via
// `saveNote`), then tell Rust it is safe to close. Without this, an async
// `beforeunload` handler cannot finish its IPC before the webview is torn down,
// so the last edits within the autosave/Y.Doc debounce window are lost on quit.
const BEFORE_CLOSE_EVENT = 'nevo://close-requested'
// Never block quitting on a wedged save: proceed after this bound even if the
// flush has not resolved.
const CLOSE_FLUSH_TIMEOUT_MS = 3_000

export function useAppCloseGuard() {
  const noteStore = useNoteStore()
  let unlisten: (() => void) | null = null
  let closing = false

  async function flushAndClose() {
    if (closing) return
    closing = true
    try {
      await Promise.race([
        noteStore.saveNote(),
        new Promise<void>((resolve) => setTimeout(resolve, CLOSE_FLUSH_TIMEOUT_MS)),
      ])
    } catch (error) {
      await appLogger.error({
        source: 'frontend.app',
        event: 'before_close_flush',
        message: 'Failed to flush pending writes before window close',
        error,
      })
    } finally {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('allow_app_close')
      } catch {
        /* The window will stay open if this fails; nothing else we can do. */
      }
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
