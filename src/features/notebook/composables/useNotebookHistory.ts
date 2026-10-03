import { computed, shallowRef } from 'vue'
import type { ComputedRef } from 'vue'

const MAX_ACTIONS = 100
const MAX_BYTES = 32 * 1024 * 1024

interface HistoryEntry<T> {
  before: T
  after: T
  bytes: number
  groupKey?: string
}

export interface NotebookHistory<T> {
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
  push(before: T, after: T, inverseBytes?: number, groupKey?: string): void
  undo(): boolean
  redo(): boolean
  reset(): void
}

export function createNotebookHistory<T>(
  apply: (snapshot: T) => void,
  options: { maxActions?: number; maxBytes?: number } = {},
): NotebookHistory<T> {
  const maxActions = Math.max(1, options.maxActions ?? MAX_ACTIONS)
  const maxBytes = Math.max(1, options.maxBytes ?? MAX_BYTES)
  const undoEntries = shallowRef<HistoryEntry<T>[]>([])
  const redoEntries = shallowRef<HistoryEntry<T>[]>([])
  const canUndo = computed(() => undoEntries.value.length > 0)
  const canRedo = computed(() => redoEntries.value.length > 0)

  function stackBytes(stack: HistoryEntry<T>[]): number {
    return stack.reduce((sum, entry) => sum + entry.bytes, 0)
  }

  function trimOldest(): void {
    while (undoEntries.value.length > 1 && (
      undoEntries.value.length > maxActions || stackBytes(undoEntries.value) > maxBytes
    )) undoEntries.value.shift()
  }

  function push(before: T, after: T, inverseBytes = 1, groupKey?: string): void {
    if (before === after) return
    const bytes = Math.max(1, Math.min(maxBytes, Math.ceil(inverseBytes)))
    const previous = undoEntries.value.at(-1)
    if (groupKey && previous?.groupKey === groupKey) {
      undoEntries.value = [...undoEntries.value.slice(0, -1), { ...previous, after, bytes: Math.min(maxBytes, previous.bytes + bytes) }]
      redoEntries.value = []
      trimOldest()
      return
    }
    undoEntries.value = [...undoEntries.value, { before, after, bytes, groupKey }]
    redoEntries.value = []
    trimOldest()
  }

  function undo(): boolean {
    const entry = undoEntries.value.at(-1)
    if (!entry) return false
    undoEntries.value = undoEntries.value.slice(0, -1)
    redoEntries.value = [...redoEntries.value, entry]
    apply(entry.before)
    return true
  }

  function redo(): boolean {
    const entry = redoEntries.value.at(-1)
    if (!entry) return false
    redoEntries.value = redoEntries.value.slice(0, -1)
    undoEntries.value = [...undoEntries.value, entry]
    apply(entry.after)
    return true
  }

  function reset(): void {
    undoEntries.value = []
    redoEntries.value = []
  }

  return { canUndo, canRedo, push, undo, redo, reset }
}
