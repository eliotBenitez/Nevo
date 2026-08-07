import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue'
import type { CanvasFrameElement, CanvasSnapshotV1 } from '../../../core/canvas'

interface UseCanvasPresentationOptions {
  snapshot: Ref<CanvasSnapshotV1>
  focusFrame: (frame: CanvasFrameElement) => void
}

export function useCanvasPresentation(options: UseCanvasPresentationOptions) {
  const active = ref(false)
  const index = ref(0)
  const frames = computed(() => Object.values(options.snapshot.value.elements)
    .filter((element): element is CanvasFrameElement => element.kind === 'frame')
    .sort((a, b) => a.presentationOrder - b.presentationOrder || a.zIndex - b.zIndex))
  const current = computed(() => frames.value[index.value] ?? null)

  function focus() {
    if (current.value) options.focusFrame(current.value)
  }

  function start(frameId?: string) {
    if (frames.value.length === 0) return false
    const requested = frameId ? frames.value.findIndex(frame => frame.id === frameId) : -1
    index.value = requested >= 0 ? requested : 0
    active.value = true
    focus()
    return true
  }

  function stop() {
    active.value = false
  }

  function move(delta: number) {
    if (!active.value || frames.value.length === 0) return
    index.value = (index.value + delta + frames.value.length) % frames.value.length
    focus()
  }

  function onKeydown(event: KeyboardEvent) {
    if (!active.value) return
    if (event.key === 'Escape') {
      event.preventDefault()
      stop()
    } else if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault()
      move(1)
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      move(-1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      index.value = 0
      focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      index.value = frames.value.length - 1
      focus()
    }
  }

  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

  return { active, index, frames, current, start, stop, next: () => move(1), previous: () => move(-1) }
}
