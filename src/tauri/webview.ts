/**
 * Native webview zoom, used in place of CSS `zoom` inside Tauri. WebKitGTK
 * (Linux) and WebView2 (Windows) disagree on how CSS `zoom` affects layout
 * dimensions, so `--ui-scale` alone breaks Windows layout when the slider
 * moves. `webview.setZoom()` is handled identically by both engines, so it
 * is the source of truth in Tauri; CSS `zoom` remains only as the web/dev
 * fallback (see src/styles/base.css).
 */

/**
 * Applies the given zoom factor via the Tauri webview API. Returns whether the
 * native zoom was applied so the caller can fall back to CSS `zoom` otherwise
 * (plain web build, dev browser, jsdom tests, or an unexpected runtime error).
 * The `@tauri-apps/api/webview` import is lazy so it never loads outside Tauri.
 */
export async function applyWebviewZoom(factor: number): Promise<boolean> {
  if (typeof document === 'undefined') return false
  const platform = document.documentElement.dataset.platform
  if (platform === 'web' || platform === undefined) return false
  if (!('__TAURI_INTERNALS__' in window)) return false

  try {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview')
    await getCurrentWebview().setZoom(factor)
    return true
  } catch {
    return false
  }
}
