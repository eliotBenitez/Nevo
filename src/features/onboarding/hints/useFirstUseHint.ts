import { onBeforeUnmount, onMounted, type Ref } from 'vue'
import { getActivePinia } from 'pinia'
import type { FirstUseHintId } from '../../../types/workspace'
import { useOnboardingStore } from '../../../stores/onboarding'

export interface UseFirstUseHintOptions {
  /** When provided and false at settle time, the hint is not requested (e.g. the screen isn't fully ready). */
  enabled?: Ref<boolean>
}

// Long enough for the screen's own mount transitions/layout to settle before
// a coachmark measures and points at the target.
const SETTLE_DELAY_MS = 600

function findTargetEl(id: FirstUseHintId): HTMLElement | null {
  // `id` is always one of the static FirstUseHintId union members (never
  // user input), so a plain attribute selector is safe without CSS.escape.
  return document.querySelector<HTMLElement>(`[data-hint="${id}"]`)
}

function isVisible(el: HTMLElement | null): boolean {
  if (!el) return false
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0
}

/**
 * Registers a screen's first-use hint: once mounted (and settled), requests
 * the hint from `onboardingStore` if its `data-hint="<id>"` target is present
 * and visible. Releases the hint (marks it seen) either when the user clicks
 * the target themselves or when the screen unmounts while the hint is still
 * showing. Safe to call from a component under test with no active Pinia —
 * mirrors the `getActivePinia()` guard already used for tour bookkeeping in
 * `GraphView.vue`.
 */
export function useFirstUseHint(id: FirstUseHintId, options: UseFirstUseHintOptions = {}) {
  let settleTimer: ReturnType<typeof setTimeout> | null = null
  let targetEl: HTMLElement | null = null
  let requested = false

  function onTargetClick() {
    release()
  }

  function release() {
    targetEl?.removeEventListener('click', onTargetClick)
    targetEl = null
    if (!requested) return
    requested = false
    if (!getActivePinia()) return
    void useOnboardingStore().releaseHint(id)
  }

  function attempt() {
    settleTimer = null
    if (options.enabled && !options.enabled.value) return
    if (!getActivePinia()) return
    const el = findTargetEl(id)
    if (!el || !isVisible(el)) return
    if (!useOnboardingStore().requestHint(id)) return
    requested = true
    targetEl = el
    targetEl.addEventListener('click', onTargetClick, { once: true })
  }

  onMounted(() => {
    settleTimer = setTimeout(attempt, SETTLE_DELAY_MS)
  })

  onBeforeUnmount(() => {
    if (settleTimer !== null) {
      clearTimeout(settleTimer)
      settleTimer = null
    }
    release()
  })
}
