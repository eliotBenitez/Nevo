import { onBeforeUnmount, type Ref } from 'vue'

export const SETTING_HIGHLIGHT_CLASS = 'settings-row--highlight'
const HIGHLIGHT_MS = 1600
// Section panels are async components, so the target row may not exist yet
// when a search result is chosen; keep looking for a short while.
const LOOKUP_TIMEOUT_MS = 1500
const FOCUSABLE = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Finds the settings row whose visible title matches a search result title. */
export function findSettingRow(root: ParentNode, title: string): HTMLElement | null {
  const expected = title.trim()
  if (!expected) return null
  for (const titleEl of root.querySelectorAll<HTMLElement>('.row-title')) {
    if (titleEl.textContent?.trim() === expected) {
      return titleEl.closest<HTMLElement>('.settings-row') ?? titleEl
    }
  }
  return null
}

export function useSettingHighlight(rootRef: Ref<HTMLElement | null>) {
  let frame = 0
  let clearTimer: ReturnType<typeof setTimeout> | null = null
  let highlighted: HTMLElement | null = null
  let pendingResolve: ((found: boolean) => void) | null = null

  function clearHighlight() {
    if (clearTimer) clearTimeout(clearTimer)
    clearTimer = null
    highlighted?.classList.remove(SETTING_HIGHLIGHT_CLASS)
    highlighted = null
  }

  function cancelLookup() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    pendingResolve?.(false)
    pendingResolve = null
  }

  function reveal(row: HTMLElement) {
    clearHighlight()
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    row.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    row.classList.add(SETTING_HIGHLIGHT_CLASS)
    highlighted = row
    row.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true })
    clearTimer = setTimeout(clearHighlight, HIGHLIGHT_MS)
  }

  /** Scrolls to, focuses and briefly highlights a setting; resolves false when it is not rendered. */
  function revealSetting(title: string): Promise<boolean> {
    cancelLookup()
    const deadline = performance.now() + LOOKUP_TIMEOUT_MS
    return new Promise((resolve) => {
      pendingResolve = resolve
      const finish = (found: boolean) => {
        pendingResolve = null
        resolve(found)
      }
      const attempt = () => {
        frame = 0
        const root = rootRef.value
        const row = root ? findSettingRow(root, title) : null
        if (row) {
          reveal(row)
          finish(true)
        } else if (performance.now() >= deadline) {
          finish(false)
        } else {
          frame = requestAnimationFrame(attempt)
        }
      }
      frame = requestAnimationFrame(attempt)
    })
  }

  onBeforeUnmount(() => {
    cancelLookup()
    clearHighlight()
  })

  return { revealSetting }
}
