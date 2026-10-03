import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { isNotebookShapeKind } from '../../../core/notebook/shape'
import { addPresetColor, NOTEBOOK_QUICK_LIMIT, pushRecentColor, removePresetColor } from '../../../core/notebook/palette'
import { useWorkspaceStore } from '../../../stores/workspace'

const WRITE_DEBOUNCE_MS = 800
const INK_TOOLS: readonly string[] = ['pen', 'marker', 'line', 'arrow']

/** Tools whose committed gestures leave colored ink (eraser, lasso, move, hand and laser do not). */
export function isNotebookInkTool(tool: string): boolean {
  return INK_TOOLS.includes(tool) || isNotebookShapeKind(tool)
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

/** Notebook preset/recent colors, persisted in the app-wide config with a debounced write. */
export function useNotebookPalette(options: { debounceMs?: number } = {}) {
  const workspaceStore = useWorkspaceStore()
  const debounceMs = options.debounceMs ?? WRITE_DEBOUNCE_MS
  const stored = () => workspaceStore.appConfig.notebookPalette
  const presets = ref<string[]>([...(stored()?.presets ?? [])])
  const recents = ref<string[]>([...(stored()?.recents ?? [])])
  const quickColors = computed(() => recents.value.slice(0, NOTEBOOK_QUICK_LIMIT))
  let timer: ReturnType<typeof setTimeout> | null = null

  function isPersisted(): boolean {
    const current = stored()
    return sameList(presets.value, current?.presets ?? []) && sameList(recents.value, current?.recents ?? [])
  }

  function flush(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (isPersisted()) return
    void workspaceStore.saveAppConfig({ notebookPalette: { presets: [...presets.value], recents: [...recents.value] } })
  }

  function schedule(): void {
    if (timer) clearTimeout(timer)
    if (isPersisted()) {
      timer = null
      return
    }
    timer = setTimeout(flush, debounceMs)
  }

  function recordUse(color: string): void {
    const next = pushRecentColor(recents.value, color)
    if (sameList(next, recents.value)) return
    recents.value = next
    schedule()
  }

  function addPreset(color: string): void {
    const next = addPresetColor(presets.value, color)
    if (sameList(next, presets.value)) return
    presets.value = next
    schedule()
  }

  function removePreset(color: string): void {
    const next = removePresetColor(presets.value, color)
    if (sameList(next, presets.value)) return
    presets.value = next
    schedule()
  }

  // Adopt config reloaded from elsewhere (e.g. initial load) unless a local write is pending.
  watch(stored, (next) => {
    if (timer || !next) return
    presets.value = [...next.presets]
    recents.value = [...next.recents]
  })

  if (getCurrentScope()) onScopeDispose(flush)

  return { presets, recents, quickColors, recordUse, addPreset, removePreset, flush }
}
