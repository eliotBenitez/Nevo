import { invoke } from '@tauri-apps/api/core'

// The AI provider key lives in the OS secret store and is read only by Rust, which
// binds it to the endpoint it was saved for. The webview can save, check and
// delete it, but never reads it back.

export function saveAiApiKey(baseUrl: string, key: string): Promise<void> {
  return invoke('ai_api_key_save', { baseUrl, key })
}

/** Whether a key is saved for `baseUrl`'s endpoint. */
export function hasAiApiKey(baseUrl: string): Promise<boolean> {
  return invoke('ai_api_key_status', { baseUrl })
}

export function deleteAiApiKey(): Promise<void> {
  return invoke('ai_api_key_delete')
}
