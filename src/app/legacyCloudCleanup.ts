import { secureStore, SECRET_PRIVATE_KEY, SECRET_REFRESH_TOKEN } from '../tauri/secureStore'

// Best-effort, one-time cleanup of state left over from the removed
// cloud / shared-storage feature (server URL, offline cache, auth secrets).
// Every step is isolated so a failure in one never blocks the others or app
// startup, and the whole thing runs at most once per install.

const CLEANUP_DONE_FLAG = 'nevo.legacyCloudCleanupDone'

export async function runLegacyCloudCleanup(): Promise<void> {
  try {
    if (localStorage.getItem(CLEANUP_DONE_FLAG) === 'true') return
  } catch {
    return
  }

  try {
    localStorage.removeItem('nevo.serverUrl')
  } catch {
    /* ignore */
  }

  try {
    indexedDB?.deleteDatabase('nevo-cloud-offline')
  } catch {
    /* ignore */
  }

  try {
    await secureStore.delete(SECRET_REFRESH_TOKEN)
  } catch {
    /* ignore */
  }

  try {
    await secureStore.delete(SECRET_PRIVATE_KEY)
  } catch {
    /* ignore */
  }

  try {
    localStorage.setItem(CLEANUP_DONE_FLAG, 'true')
  } catch {
    /* ignore */
  }
}
