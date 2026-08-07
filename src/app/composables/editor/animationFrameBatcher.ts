export interface AnimationFrameBatcher {
  schedule: () => void
  cancel: () => void
}

interface AnimationFrameBatcherTiming {
  requestFrame?: (callback: FrameRequestCallback) => number
  cancelFrame?: (handle: number) => void
}

/**
 * Coalesces a burst of high-frequency UI events into at most one callback per
 * animation frame. The injected timing hooks keep the scheduler deterministic
 * in unit tests and non-browser preview environments.
 */
export function createAnimationFrameBatcher(
  callback: () => void,
  timing: AnimationFrameBatcherTiming = {},
): AnimationFrameBatcher {
  const requestFrame = timing.requestFrame
    ?? ((next: FrameRequestCallback) => window.requestAnimationFrame(next))
  const cancelFrame = timing.cancelFrame
    ?? ((handle: number) => window.cancelAnimationFrame(handle))

  let frameHandle: number | null = null

  function schedule() {
    if (frameHandle !== null) return
    frameHandle = requestFrame(() => {
      frameHandle = null
      callback()
    })
  }

  function cancel() {
    if (frameHandle === null) return
    cancelFrame(frameHandle)
    frameHandle = null
  }

  return { schedule, cancel }
}
