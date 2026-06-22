import { ref, computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import type { DrawStroke } from '../../../utils/draw/drawEngine'

let drawClipboard: DrawStroke[] = []
const clipboardVersion = ref(0)

export function getClipboard(): DrawStroke[] {
  return drawClipboard
}

export function setClipboard(list: DrawStroke[]) {
  drawClipboard = list
  clipboardVersion.value += 1
}

export interface DrawHistory {
  undoStack: Ref<DrawStroke[][]>
  redoStack: Ref<DrawStroke[][]>
  pushHistory(): void
  commitHistory(snapshot: DrawStroke[]): void
  undo(): void
  redo(): void
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
  canPaste: ComputedRef<boolean>
  getClipboard(): DrawStroke[]
  setClipboard(list: DrawStroke[]): void
  clipboardVersion: Ref<number>
}

export function createDrawHistory(strokes: Ref<DrawStroke[]>): DrawHistory {
  const undoStack = ref<DrawStroke[][]>([])
  const redoStack = ref<DrawStroke[][]>([])

  function pushHistory() {
    undoStack.value.push(strokes.value.map((s) => ({ ...s, points: [...s.points] })))
    if (undoStack.value.length > 100) undoStack.value.shift()
    redoStack.value = []
  }

  function commitHistory(snapshot: DrawStroke[]) {
    undoStack.value.push(snapshot)
    if (undoStack.value.length > 100) undoStack.value.shift()
    redoStack.value = []
  }

  function undo() {
    if (undoStack.value.length === 0) return
    redoStack.value.push(strokes.value.map((s) => ({ ...s, points: [...s.points] })))
    strokes.value = undoStack.value.pop()!
  }

  function redo() {
    if (redoStack.value.length === 0) return
    undoStack.value.push(strokes.value.map((s) => ({ ...s, points: [...s.points] })))
    strokes.value = redoStack.value.pop()!
  }

  const canUndo = computed(() => undoStack.value.length > 0)
  const canRedo = computed(() => redoStack.value.length > 0)

  const canPaste = computed(() => {
    void clipboardVersion.value
    return drawClipboard.length > 0
  })

  return {
    undoStack,
    redoStack,
    pushHistory,
    commitHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    canPaste,
    getClipboard,
    setClipboard,
    clipboardVersion,
  }
}
