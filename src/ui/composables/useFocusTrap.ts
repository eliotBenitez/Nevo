import { onBeforeUnmount, onMounted, type Ref } from 'vue'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useFocusTrap(containerRef: Ref<HTMLElement | null>, active: Ref<boolean>) {
  let previousFocus: HTMLElement | null = null

  function getFocusable(): HTMLElement[] {
    return containerRef.value ? Array.from(containerRef.value.querySelectorAll<HTMLElement>(FOCUSABLE)) : []
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!active.value || e.key !== 'Tab') return
    const focusable = getFocusable()
    if (!focusable.length) { e.preventDefault(); return }

    const first = focusable[0]
    const last = focusable[focusable.length - 1]

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus() }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus() }
    }
  }

  onMounted(() => { document.addEventListener('keydown', onKeyDown) })
  onBeforeUnmount(() => { document.removeEventListener('keydown', onKeyDown) })

  function activate() {
    previousFocus = document.activeElement as HTMLElement | null
    const focusable = getFocusable()
    focusable[0]?.focus()
  }

  function deactivate() {
    previousFocus?.focus()
    previousFocus = null
  }

  return { activate, deactivate }
}
