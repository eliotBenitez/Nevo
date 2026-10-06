import { CDPConnection, assertLoopbackUrl } from './windows-cdp.mjs'

const APP_ORIGINS = new Set(['http://tauri.localhost', 'https://tauri.localhost'])

export function findAndroidTarget(targets, port, targetId) {
  const pages = targets.filter((target) => target.type === 'page' && (() => {
    try { return APP_ORIGINS.has(new URL(target.url).origin) } catch { return false }
  })())
  const selected = targetId ? pages.find((target) => target.id === targetId) : pages.length === 1 ? pages[0] : null
  if (!selected) {
    if (pages.length > 1 && !targetId) throw new Error(`Multiple Nevo pages are available; pass --target ID (${pages.map((page) => page.id).join(', ')})`)
    throw new Error(targetId ? `No Nevo page matches target ${targetId}` : 'No Nevo page found at tauri.localhost; is the debug APK running?')
  }
  // Android WebView may omit the host from webSocketDebuggerUrl; rebuild it on the forwarded loopback port.
  const socketUrl = `ws://127.0.0.1:${port}/devtools/page/${encodeURIComponent(selected.id)}`
  return { ...selected, webSocketDebuggerUrl: assertLoopbackUrl(socketUrl, ['ws:']).toString() }
}

export function assertAndroidMetadata(metadata) {
  if (metadata?.runtime !== 'android') throw new Error(`Refusing to operate on a non-Android app runtime: ${metadata?.runtime ?? 'unknown'}`)
  return metadata
}

export async function connectToAndroidPage(port, targetId, { fetchImpl = fetch, WebSocketImpl = WebSocket, timeoutMs = 10_000 } = {}) {
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('Port must be between 1 and 65535')
  const response = await fetchImpl(`http://127.0.0.1:${Number(port)}/json/list`, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
  if (!response.ok) throw new Error(`CDP target list returned HTTP ${response.status}`)
  const target = findAndroidTarget(await response.json(), Number(port), targetId)
  const connection = await CDPConnection.connect(target.webSocketDebuggerUrl, { WebSocketImpl, timeoutMs })
  return { target, connection }
}

export async function getAndroidMetadata(connection) {
  const { result, exceptionDetails } = await connection.send('Runtime.evaluate', {
    expression: `(() => { if (!window.__TAURI_INTERNALS__?.invoke) throw new Error('Tauri internals unavailable'); return window.__TAURI_INTERNALS__.invoke('get_app_metadata') })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'Unable to read Tauri app metadata')
  return assertAndroidMetadata(result?.value)
}

export function buildTapEvents(x, y) {
  const point = { x, y, radiusX: 4, radiusY: 4, force: 1, id: 0 }
  return [
    { type: 'touchStart', touchPoints: [point] },
    { type: 'touchEnd', touchPoints: [] },
  ]
}
