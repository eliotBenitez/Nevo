// Shared size limit for a single imported asset (image/file/media payload).
//
// Mirrors `MAX_LOCAL_ASSET_BYTES` in
// `src-tauri/src/commands/note/assets/import.rs` — keep both in sync. This
// frontend check runs first, before the bytes ever leave the browser, so a
// user gets immediate feedback and the WebView never has to inflate/transport
// a huge payload; the Rust-side limit is the real enforcement boundary since
// this one is bypassable by anything that can call the IPC command directly.
export const MAX_ASSET_BYTES = 100 * 1024 * 1024
export const MAX_ASSET_MB = MAX_ASSET_BYTES / (1024 * 1024)

export function isWithinAssetLimit(size: number): boolean {
  return size <= MAX_ASSET_BYTES
}
