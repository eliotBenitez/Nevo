import { onBeforeUnmount, onMounted, type Ref } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** True unless `el` is an aria-modal dialog with another one stacked after it in the DOM. */
export function isTopmostModal(el: HTMLElement | null): boolean {
  if (!el || el.getAttribute('aria-modal') !== 'true') return true
  const modals = document.querySelectorAll('[aria-modal="true"]')
  return modals[modals.length - 1] === el
}

export function useFocusTrap(containerRef: Ref<HTMLElement | null>, active: Ref<boolean>) {
  let previousFocus: HTMLElement | null = null

  function getFocusable(): HTMLElement[] {
    return containerRef.value ? Array.from(containerRef.value.querySelectorAll<HTMLElement>(FOCUSABLE)) : []
  }

  function onKeyDown(e: KeyboardEvent) {
    // Only the topmost dialog traps Tab; one underneath would steal focus from it.
    if (!active.value || e.key !== 'Tab' || e.defaultPrevented || !isTopmostModal(containerRef.value)) return
    const focusable = getFocusable()
    if (!focusable.length) { e.preventDefault(); return }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    // Focus fell to <body> (the focused control was disabled or removed): bring it back.
    if (!document.activeElement || document.activeElement === document.body) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
      return
    }

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  onMounted(() => { document.addEventListener('keydown', onKeyDown) })
  onBeforeUnmount(() => { document.removeEventListener('keydown', onKeyDown) })

  function activate(restoreTo = document.activeElement as HTMLElement | null) {
    previousFocus = restoreTo
    // Content that already focused its own primary control keeps that focus.
    if (containerRef.value?.contains(document.activeElement)) return
    getFocusable()[0]?.focus()
  }

  function deactivate() {
    previousFocus?.focus()
    previousFocus = null
  }

  return { activate, deactivate }
}
