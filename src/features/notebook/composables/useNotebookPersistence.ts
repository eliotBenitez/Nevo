import { onBeforeUnmount } from 'vue'
import { listen } from '@tauri-apps/api/event'
import { registerEditorPersistence } from '../../../core/document-session/editorSessionRegistry'

export interface NotebookPersistenceSession {
  markChanged(): void
  flushNow(finishInput?: boolean): Promise<void>
  suspend(): void
}

export function useNotebookPersistence(options: {
  noteId: string
  workspacePath: string
  isCurrent(): boolean
  flushInput(): void
  suspendInput(): void
  flushDurably(options?: { flushEditorSession?: boolean }): Promise<{ ok: true } | { ok: false; error: unknown }>
  onError(error: unknown): void
  supportsLifecycleEvents?: boolean
  resumeInput?(): void
  setTimeout?: typeof window.setTimeout
  clearTimeout?: typeof window.clearTimeout
}): NotebookPersistenceSession {
  const scheduleTimeout = options.setTimeout ?? window.setTimeout.bind(window)
  const cancelTimeout = options.clearTimeout ?? window.clearTimeout.bind(window)
  let debounceTimer: number | undefined
  let maximumTimer: number | undefined
  let suspended = false
  let unmounted = false

  function cancelTimers(): void {
    if (debounceTimer !== undefined) cancelTimeout(debounceTimer)
    if (maximumTimer !== undefined) cancelTimeout(maximumTimer)
    debounceTimer = undefined
    maximumTimer = undefined
  }

  async function flushNow(finishInput = true): Promise<void> {
    cancelTimers()
    if (suspended || unmounted || !options.isCurrent()) return
    if (finishInput) options.flushInput()
    try {
      const result = await options.flushDurably(finishInput ? undefined : { flushEditorSession: false })
      if (!result.ok) options.onError(result.error)
    } catch (error) {
      options.onError(error)
    }
  }

  function markChanged(): void {
    if (unmounted || !options.isCurrent()) return
    suspended = false
    if (debounceTimer !== undefined) cancelTimeout(debounceTimer)
    debounceTimer = scheduleTimeout(() => { void flushNow(false) }, 300) as unknown as number
    if (maximumTimer === undefined) {
      maximumTimer = scheduleTimeout(() => { void flushNow(false) }, 2_000) as unknown as number
    }
  }

  function suspend(): void {
    suspended = true
    cancelTimers()
    options.suspendInput()
  }

  const unregister = registerEditorPersistence(options.noteId, {
    suspend: () => { options.flushInput(); suspend() },
    flushContent: () => {
      options.flushInput()
    },
  })

  const onFocusLoss = () => { void flushNow() }
  window.addEventListener('blur', onFocusLoss)
  document.addEventListener('visibilitychange', onFocusLoss)
  let lifecycleUnlisten: Array<() => void> = []
  let disposed = false
  if (options.supportsLifecycleEvents) {
    void Promise.all([
      listen('nevo://notebook-suspended', async () => {
        options.suspendInput()
        options.flushInput()
        await flushNow()
        suspend()
      }),
      listen('nevo://notebook-resumed', () => {
        suspended = false
        options.resumeInput?.()
        markChanged()
      }),
    ]).then(unlisten => {
      if (disposed) unlisten.forEach(stop => stop())
      else lifecycleUnlisten = unlisten
    }).catch(options.onError)
  }

  onBeforeUnmount(() => {
    options.flushInput()
    disposed = true
    unmounted = true
    cancelTimers()
    unregister()
    window.removeEventListener('blur', onFocusLoss)
    document.removeEventListener('visibilitychange', onFocusLoss)
    lifecycleUnlisten.forEach(stop => stop())
  })

  return { markChanged, flushNow, suspend }
}
