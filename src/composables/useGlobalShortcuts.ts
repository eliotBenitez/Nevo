import { watch } from 'vue'
import { useWorkspaceStore } from '../stores/workspace'
import { dispatchHotkeyCommand, getGlobalShortcutBindings } from '../utils/hotkeys'
import { resolveRuntimeCapabilities } from '../utils/runtime'

let initialized = false
let registeredShortcuts: string[] = []
let syncSequence = 0
let shortcutApiPromise: Promise<{
  register: typeof import('@tauri-apps/plugin-global-shortcut').register
  unregister: typeof import('@tauri-apps/plugin-global-shortcut').unregister
} | null> | null = null

function isShortcutWindowActive(): boolean {
  return typeof document !== 'undefined' && document.hasFocus() && !document.hidden
}

async function loadShortcutApi() {
  if (!shortcutApiPromise) {
    shortcutApiPromise = import('@tauri-apps/plugin-global-shortcut')
      .then(module => ({
        register: module.register,
        unregister: module.unregister,
      }))
      .catch(() => null)
  }

  return shortcutApiPromise
}

async function unregisterShortcuts() {
  if (!registeredShortcuts.length) return

  const previous = [...registeredShortcuts]
  registeredShortcuts = []
  const shortcutApi = await loadShortcutApi()
  if (!shortcutApi) return

  for (const shortcut of previous) {
    try {
      await shortcutApi.unregister(shortcut)
    } catch {
      // No-op in web mode or if the shortcut was already released.
    }
  }
}

async function syncGlobalShortcuts() {
  const workspaceStore = useWorkspaceStore()
  const sequence = ++syncSequence

  await unregisterShortcuts()

  if (sequence !== syncSequence) return
  if (!resolveRuntimeCapabilities(workspaceStore.appMetadata).supportsGlobalShortcuts) return
  if (!workspaceStore.activePath || !isShortcutWindowActive()) return

  const shortcutApi = await loadShortcutApi()
  if (!shortcutApi) return

  for (const binding of getGlobalShortcutBindings(workspaceStore.settings.hotkeys.bindings)) {
    try {
      await shortcutApi.register(binding.shortcut, (event) => {
        if (event.state !== 'Pressed') return
        dispatchHotkeyCommand(binding.commandId)
      })
      registeredShortcuts.push(binding.shortcut)
    } catch {
      // Another app may own the shortcut, or the plugin may be unavailable in web mode.
    }
  }
}

export function initGlobalShortcuts() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const workspaceStore = useWorkspaceStore()

  watch(
    () => [
      workspaceStore.activePath,
      workspaceStore.appMetadata?.runtime ?? 'web',
      workspaceStore.appMetadata?.supportsGlobalShortcuts ?? false,
      ...workspaceStore.settings.hotkeys.bindings.map(binding => [
        binding.commandId,
        binding.defaultChord,
        binding.customChord ?? '',
        binding.scope,
      ].join(':')),
    ],
    () => {
      void syncGlobalShortcuts()
    },
    { immediate: true },
  )

  const handleWindowActivity = () => {
    void syncGlobalShortcuts()
  }

  window.addEventListener('focus', handleWindowActivity)
  window.addEventListener('blur', handleWindowActivity)
  document.addEventListener('visibilitychange', handleWindowActivity)
}
