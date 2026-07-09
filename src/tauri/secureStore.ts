import { invoke } from '@tauri-apps/api/core'

// Thin wrapper over the Rust secure store (OS app-config-dir backed).
// Keys are namespaced strings; values are opaque strings (base64 / tokens).

export const SECRET_PRIVATE_KEY = 'e2e.privateKey'
export const SECRET_REFRESH_TOKEN = 'auth.refreshToken'

export const secureStore = {
  set: (key: string, value: string) =>
    invoke<void>('secure_store_set', { key, value }),

  get: (key: string) =>
    invoke<string | null>('secure_store_get', { key }),

  delete: (key: string) =>
    invoke<void>('secure_store_delete', { key }),
}

/** Namespaced secure-store key for a plugin settings field marked `secret: true`. */
export function pluginSecretKey(pluginId: string, fieldKey: string): string {
  return `${pluginId}.${fieldKey}`
}
