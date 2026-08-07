export interface IdleTaskScheduler {
  schedule: () => void
  flush: () => boolean
  cancel: () => void
  isPending: () => boolean
}

interface IdleTaskSchedulerTiming {
  setTimeout?: (callback: () => void, delayMs: number) => number
  clearTimeout?: (handle: number) => void
  requestIdleCallback?: (callback: () => void, timeoutMs: number) => number
  cancelIdleCallback?: (handle: number) => void
}

interface IdleTaskSchedulerOptions {
  delayMs: number
  idleTimeoutMs?: number
  timing?: IdleTaskSchedulerTiming
}

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number
  cancelIdleCallback?: (handle: number) => void
}

const DEFAULT_IDLE_TIMEOUT_MS = 1_000

/**
 * Debounces expensive derived work, then runs it during an idle period when the
 * host supports one. `flush()` remains synchronous for note switches, saves,
 * and teardown paths where dropping the latest document is not acceptable.
 */
export function createIdleTaskScheduler(
  task: () => void,
  options: IdleTaskSchedulerOptions,
): IdleTaskScheduler {
  const idleWindow = window as IdleWindow
  const setTimeoutFn = options.timing?.setTimeout
    ?? ((callback: () => void, delayMs: number) => window.setTimeout(callback, delayMs))
  const clearTimeoutFn = options.timing?.clearTimeout
    ?? ((handle: number) => window.clearTimeout(handle))
  const requestIdleCallbackFn = options.timing?.requestIdleCallback
    ?? (idleWindow.requestIdleCallback
      ? (callback: () => void, timeoutMs: number) => idleWindow.requestIdleCallback!(
          () => callback(),
          { timeout: timeoutMs },
        )
      : null)
  const cancelIdleCallbackFn = options.timing?.cancelIdleCallback
    ?? (idleWindow.cancelIdleCallback
      ? (handle: number) => idleWindow.cancelIdleCallback!(handle)
      : null)

  let pending = false
  let delayHandle: number | null = null
  let idleHandle: number | null = null
  let idleUsesTimer = false

  function clearScheduledWork() {
    if (delayHandle !== null) {
      clearTimeoutFn(delayHandle)
      delayHandle = null
    }
    if (idleHandle !== null) {
      if (idleUsesTimer) clearTimeoutFn(idleHandle)
      else cancelIdleCallbackFn?.(idleHandle)
      idleHandle = null
      idleUsesTimer = false
    }
  }

  function run() {
    if (!pending) return
    clearScheduledWork()
    pending = false
    task()
  }

  function scheduleIdleWork() {
    delayHandle = null
    if (!pending) return

    if (requestIdleCallbackFn) {
      idleUsesTimer = false
      idleHandle = requestIdleCallbackFn(
        run,
        options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
      )
      return
    }

    idleUsesTimer = true
    idleHandle = setTimeoutFn(run, 0)
  }

  function schedule() {
    clearScheduledWork()
    pending = true
    delayHandle = setTimeoutFn(scheduleIdleWork, Math.max(0, options.delayMs))
  }

  function flush() {
    if (!pending) return false
    run()
    return true
  }

  function cancel() {
    clearScheduledWork()
    pending = false
  }

  return {
    schedule,
    flush,
    cancel,
    isPending: () => pending,
  }
}
