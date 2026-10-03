import { getCurrentScope, onScopeDispose } from 'vue'
import {
  normalizeNotebookToolPreferences,
  resolveNotebookToolSettings,
  type NotebookToolPreferences,
  type NotebookToolSettings,
} from '../../../core/notebook/toolPreferences'
import { useWorkspaceStore } from '../../../stores/workspace'

const WRITE_DEBOUNCE_MS = 800

function samePreferences(left: NotebookToolPreferences | undefined, right: NotebookToolPreferences | undefined): boolean {
  return left?.penColor === right?.penColor && left?.markerColor === right?.markerColor
    && left?.strokeWidth === right?.strokeWidth && left?.markerWidth === right?.markerWidth
}

/**
 * Remembers the last pen/marker colors and widths app-wide (`AppConfig.notebookTools`)
 * so every notebook opens with them. Writes are debounced and skipped when nothing changed;
 * a pending write is flushed when the notebook closes.
 */
export function useNotebookToolPreferences(options: { debounceMs?: number } = {}) {
  const workspaceStore = useWorkspaceStore()
  const debounceMs = options.debounceMs ?? WRITE_DEBOUNCE_MS
  let pending: NotebookToolPreferences = { ...normalizeNotebookToolPreferences(workspaceStore.appConfig.notebookTools) }
  let timer: ReturnType<typeof setTimeout> | null = null

  /** Values to start a notebook with: stored preferences, defaults for the rest. */
  const initial: NotebookToolSettings = resolveNotebookToolSettings(pending)

  function flush(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (samePreferences(pending, workspaceStore.appConfig.notebookTools)) return
    void workspaceStore.saveAppConfig({ notebookTools: { ...pending } })
  }

  function remember(patch: NotebookToolPreferences): void {
    const next = normalizeNotebookToolPreferences({ ...pending, ...patch }) ?? {}
    if (samePreferences(next, pending)) return
    pending = next
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, debounceMs)
  }

  if (getCurrentScope()) onScopeDispose(flush)

  return { initial, remember, flush }
}
