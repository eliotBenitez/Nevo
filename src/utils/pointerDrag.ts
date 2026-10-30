/** Movement (px) before a pointerdown turns into a drag, so plain clicks keep working. */
export const POINTER_DRAG_THRESHOLD = 4

/** Swallows the click the browser fires after a drag ends on the pressed element. */
export function swallowNextClick() {
  const swallow = (event: Event) => {
    event.stopPropagation()
    event.preventDefault()
    cleanup()
  }
  const timer = setTimeout(cleanup, 120)
  function cleanup() {
    clearTimeout(timer)
    window.removeEventListener('click', swallow, true)
  }
  window.addEventListener('click', swallow, true)
}

export interface PointerDragHandlers {
  /** Pointer crossed the movement threshold. `onMove` is called right after for the same event. */
  onStart?: (event: PointerEvent) => void
  onMove: (event: PointerEvent) => void
  /** Pointer released after a started drag. */
  onEnd?: (event: PointerEvent) => void
  /** A started drag was aborted (Escape, pointercancel or the returned cancel function). */
  onAbort?: () => void
  /** The session ended for any reason, including a release below the threshold. */
  onFinish?: () => void
}

/**
 * Pointer-event drag session (HTML5 DnD is unreliable in WebKitGTK). Call from a
 * `pointerdown` handler: the drag starts after a small movement, the click that
 * follows a drag is suppressed, and Escape / pointercancel abort it.
 * Returns a function that cancels the session (use it on unmount).
 */
export function trackPointerDrag(down: PointerEvent, handlers: PointerDragHandlers): () => void {
  const { pointerId, clientX: startX, clientY: startY } = down
  const el = down.currentTarget as HTMLElement | null
  let started = false
  let active = true

  function detach() {
    if (!active) return
    active = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', cancel)
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('selectstart', preventSelect)
    if (started) {
      try { el?.releasePointerCapture?.(pointerId) } catch { /* already released */ }
    }
    handlers.onFinish?.()
  }

  function preventSelect(event: Event) {
    event.preventDefault()
  }

  function onMove(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    if (!started) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) < POINTER_DRAG_THRESHOLD) return
      started = true
      try { el?.setPointerCapture?.(pointerId) } catch { /* pointer already gone */ }
      handlers.onStart?.(event)
    }
    handlers.onMove(event)
  }

  function onUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    const wasStarted = started
    detach()
    if (!wasStarted) return
    swallowNextClick()
    handlers.onEnd?.(event)
  }

  function cancel() {
    const wasStarted = started
    detach()
    if (wasStarted) handlers.onAbort?.()
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    const wasStarted = started
    cancel()
    // The button may still be held; the click arrives on its eventual release.
    if (wasStarted) window.addEventListener('pointerup', swallowNextClick, { once: true, capture: true })
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', cancel)
  window.addEventListener('keydown', onKey, true)
  window.addEventListener('selectstart', preventSelect)
  return cancel
}
