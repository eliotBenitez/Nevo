import { onBeforeUnmount, onMounted } from 'vue'

/** Listens to window keydown for the lifetime of the calling component. */
export function useWindowKeydown(handler: (event: KeyboardEvent) => void) {
  onMounted(() => window.addEventListener('keydown', handler))
  onBeforeUnmount(() => window.removeEventListener('keydown', handler))
}
