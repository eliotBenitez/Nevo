type SystemBarsBridge = { postMessage(message: string): void }

/**
 * Tells the Android shell (SystemBarsBridge.kt) which app theme is showing, so
 * the status and navigation bar icons stay readable. The bridge object exists
 * only in the Android app's own top frame; elsewhere this is a no-op.
 */
export function syncAndroidSystemBars(theme: 'light' | 'dark') {
  const bridge = (window as unknown as { nevoSystemBars?: SystemBarsBridge }).nevoSystemBars
  if (typeof bridge?.postMessage !== 'function') return
  try {
    bridge.postMessage(theme)
  } catch {
    // A detached or reloading bridge must never break theme switching.
  }
}
