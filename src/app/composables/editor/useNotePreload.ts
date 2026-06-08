import { useNoteStore } from '../../../stores/note'

const PRELOAD_DELAY_MS = 300

function closestInternalNoteLink(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Node)) return null
  const element = target instanceof Element ? target : target.parentElement
  return element?.closest('a[data-note-id]') ?? null
}

export function useNotePreload() {
  let rootEl: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastNoteId: string | null = null

  function clearPreloadTimer() {
    if (!timer) return
    clearTimeout(timer)
    timer = null
  }

  function resetHoverState() {
    clearPreloadTimer()
    lastNoteId = null
  }

  function onMouseOver(event: MouseEvent) {
    const link = closestInternalNoteLink(event.target)
    const noteId = link?.getAttribute('data-note-id')?.trim() || null
    if (!noteId || noteId === lastNoteId) return
    lastNoteId = noteId
    clearPreloadTimer()
    timer = setTimeout(() => {
      timer = null
      const noteStore = useNoteStore()
      void noteStore.prewarmCache(noteId)
    }, PRELOAD_DELAY_MS)
  }

  function onMouseOut(event: MouseEvent) {
    const link = closestInternalNoteLink(event.target)
    if (!link) return
    const relatedTarget = event.relatedTarget
    if (relatedTarget instanceof Node && link.contains(relatedTarget)) return
    resetHoverState()
  }

  function mount(element: HTMLElement | null) {
    if (rootEl === element) return
    unmount()
    if (!element) return
    rootEl = element
    rootEl.addEventListener('mouseover', onMouseOver)
    rootEl.addEventListener('mouseout', onMouseOut)
  }

  function unmount() {
    if (!rootEl) return
    rootEl.removeEventListener('mouseover', onMouseOver)
    rootEl.removeEventListener('mouseout', onMouseOut)
    rootEl = null
    resetHoverState()
  }

  return { mount, unmount }
}
