import { createCanvasDraft, readCanvasDraft, type CanvasDraft } from './canvasDraft'
import { canvasSnapshotsEqual } from './equality'
import { emptyCanvasSnapshot, normalizeCanvasSnapshot } from './normalize'
import type { CanvasSnapshotV1 } from './types'

/**
 * Cap on retained undo/redo stack entries — bounds worst-case retained
 * memory over a long session, scaled to canvas gesture granularity: one
 * `commit()` call is one undo step.
 */
export const CANVAS_UNDO_STACK_LIMIT = 200

export type CanvasStoreListener = (snapshot: CanvasSnapshotV1) => void

/**
 * Framework-agnostic canvas state container. Owns one `CanvasSnapshotV1` —
 * the same shape persisted to `note.canvas` — plus its own snapshot-based
 * undo/redo stack, independent of the editor's text undo stack now that
 * canvas state no longer lives in the note's Y.Doc (Phase 3 of the Yjs
 * removal). No Vue/Yjs imports here; `useCanvasDocument` is the Vue-facing
 * wrapper.
 */
export class CanvasStore {
  private current: CanvasSnapshotV1 = emptyCanvasSnapshot()
  private undoStack: CanvasSnapshotV1[] = []
  private redoStack: CanvasSnapshotV1[] = []
  private readonly listeners = new Set<CanvasStoreListener>()

  get snapshot(): CanvasSnapshotV1 {
    return this.current
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /**
   * Seeds the store from a note's persisted `canvas` mirror (or a fresh
   * document when there is none yet, or when migrating a legacy per-block
   * `layouts` map — both handled by `normalizeCanvasSnapshot`) and resets
   * undo/redo history. Does not notify subscribers: callers seed before
   * subscribing, mirroring the old "connecting to an already-matching Y.Doc
   * emits nothing" behavior.
   */
  load(mirror: CanvasSnapshotV1 | undefined): void {
    this.current = normalizeCanvasSnapshot(mirror) ?? emptyCanvasSnapshot()
    this.undoStack = []
    this.redoStack = []
  }

  /**
   * Replaces the whole snapshot as one undo step (e.g. restoring a saved
   * version), reusing the same change-detection and notification path as
   * `commit`.
   */
  replace(snapshot: CanvasSnapshotV1 | undefined): boolean {
    return this.applyNext(normalizeCanvasSnapshot(snapshot) ?? emptyCanvasSnapshot())
  }

  /**
   * Runs `mutate` against a draft of the current snapshot. One call is one
   * undo step: if the result actually differs from the current snapshot
   * (structural comparison, see `canvasSnapshotsEqual`), the previous
   * snapshot is pushed onto the undo stack (cap `CANVAS_UNDO_STACK_LIMIT`,
   * dropping the oldest), the redo stack is cleared, the new snapshot is set,
   * and subscribers are notified. A mutation that produces no structural
   * change is a no-op: it does not push history and does not notify.
   */
  commit(mutate: (draft: CanvasDraft) => void): boolean {
    const draft = createCanvasDraft(this.current)
    mutate(draft)
    const next = normalizeCanvasSnapshot(readCanvasDraft(draft)) ?? emptyCanvasSnapshot()
    return this.applyNext(next)
  }

  undo(): void {
    const previous = this.undoStack.pop()
    if (!previous) return
    pushCapped(this.redoStack, this.current)
    this.current = previous
    this.notify()
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    pushCapped(this.undoStack, this.current)
    this.current = next
    this.notify()
  }

  subscribe(listener: CanvasStoreListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private applyNext(next: CanvasSnapshotV1): boolean {
    if (canvasSnapshotsEqual(this.current, next)) return false
    pushCapped(this.undoStack, this.current)
    this.redoStack = []
    this.current = next
    this.notify()
    return true
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.current)
  }
}

function pushCapped<T>(stack: T[], item: T): void {
  stack.push(item)
  if (stack.length > CANVAS_UNDO_STACK_LIMIT) stack.shift()
}
