export interface ViewportRenderBudget {
  retain: (key: object, suspend: () => boolean) => void
  release: (key: object) => void
  size: () => number
}

export const DEFAULT_VIEWPORT_RENDER_BUDGET_SIZE = 8

/**
 * Retains a bounded LRU set of offscreen NodeViews. Protected entries may
 * temporarily exceed the budget (selection, focus, or media playback), but an
 * evictable neighbor is still released when possible.
 */
export function createViewportRenderBudget(
  maxRetained = DEFAULT_VIEWPORT_RENDER_BUDGET_SIZE,
): ViewportRenderBudget {
  const retained = new Map<object, () => boolean>()
  const limit = Math.max(0, Math.floor(maxRetained))

  function trim() {
    let attemptsRemaining = retained.size
    while (retained.size > limit && attemptsRemaining > 0) {
      const oldest = retained.entries().next().value as [object, () => boolean] | undefined
      if (!oldest) return

      const [key, suspend] = oldest
      retained.delete(key)
      if (!suspend()) retained.set(key, suspend)
      attemptsRemaining--
    }
  }

  function retain(key: object, suspend: () => boolean) {
    retained.delete(key)
    retained.set(key, suspend)
    trim()
  }

  function release(key: object) {
    retained.delete(key)
  }

  return {
    retain,
    release,
    size: () => retained.size,
  }
}

export const viewportRenderBudget = createViewportRenderBudget()
