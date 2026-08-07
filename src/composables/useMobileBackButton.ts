import type { ComputedRef, Ref } from 'vue'
import { onBeforeUnmount, watch } from 'vue'

type MobileBackHandler = () => void | Promise<void>
type ReactiveBoolean = Ref<boolean> | ComputedRef<boolean>

interface BackHandlerEntry {
  id: symbol
  handler: MobileBackHandler
}

const handlers: BackHandlerEntry[] = []
let removeNativeListener: (() => void) | null = null
let listenerRequest = 0

function removeHandler(id: symbol) {
  const index = handlers.findIndex(entry => entry.id === id)
  if (index !== -1) handlers.splice(index, 1)
  void syncNativeListener()
}

async function syncNativeListener() {
  const request = ++listenerRequest
  const shouldListen = handlers.length > 0

  if (!shouldListen) {
    removeNativeListener?.()
    removeNativeListener = null
    return
  }

  if (removeNativeListener || typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return

  try {
    const { onBackButtonPress } = await import('@tauri-apps/api/app')
    const listener = await onBackButtonPress(() => {
      const activeHandler = handlers.at(-1)
      if (activeHandler) void activeHandler.handler()
    })

    if (request !== listenerRequest || handlers.length === 0) {
      void listener.unregister()
      return
    }

    removeNativeListener = () => { void listener.unregister() }
  } catch {
    // The web build and non-Android Tauri runtimes do not expose a native back event.
  }
}

/**
 * Registers a contextual Android back handler while `enabled` is true.
 * The last activated handler wins, so nested mobile screens close before their parent.
 * When no contextual handler remains, the native listener is removed and Android keeps
 * its default history/exit behavior.
 */
export function useMobileBackButton(handler: MobileBackHandler, enabled: ReactiveBoolean) {
  const id = Symbol('mobile-back-handler')
  let registered = false

  function register() {
    if (registered) return
    registered = true
    handlers.push({ id, handler })
    void syncNativeListener()
  }

  function unregister() {
    if (!registered) return
    registered = false
    removeHandler(id)
  }

  watch(enabled, active => {
    if (active) register()
    else unregister()
  }, { immediate: true })

  onBeforeUnmount(unregister)
}
