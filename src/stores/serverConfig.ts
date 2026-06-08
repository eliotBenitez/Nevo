import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

// Relay/server base URL for cloud accounts + shared storages. Persisted in
// localStorage so it survives restarts; editable from Settings. Replaces the
// previously hardcoded DEFAULT_RELAY_URL in the collab store.

const STORAGE_KEY = 'nevo.serverUrl'
const DEFAULT_SERVER_URL = 'http://localhost:8080'

export const useServerConfigStore = defineStore('serverConfig', () => {
  const serverUrl = ref<string>(localStorage.getItem(STORAGE_KEY) ?? DEFAULT_SERVER_URL)

  /** Same host as an ws:// or wss:// origin, for WebSocket connections. */
  const wsBase = computed(() => serverUrl.value.replace(/^http/, 'ws'))

  function setServerUrl(url: string): void {
    serverUrl.value = url.trim().replace(/\/$/, '')
    localStorage.setItem(STORAGE_KEY, serverUrl.value)
  }

  return { serverUrl, wsBase, setServerUrl }
})
