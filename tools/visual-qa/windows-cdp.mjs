import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const DEV_ORIGINS = new Set(['http://localhost:1420', 'http://127.0.0.1:1420'])
const QA_CONFIG_COMPONENT = 'com.eliotBenitezhvat.nevo.qa'

function isLoopback(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1'
}

export function assertLoopbackUrl(value, protocols = ['http:', 'ws:']) {
  const url = new URL(value)
  if (!protocols.includes(url.protocol) || !isLoopback(url.hostname)) {
    throw new Error(`Refusing non-loopback debugging URL: ${value}`)
  }
  return url
}

export function findTarget(targets, targetId) {
  const pages = targets.filter((target) => target.type === 'page' && (() => {
    try { return DEV_ORIGINS.has(new URL(target.url).origin) } catch { return false }
  })())
  const selected = targetId ? pages.find((target) => target.id === targetId) : pages.length === 1 ? pages[0] : null
  if (!selected) {
    if (pages.length > 1 && !targetId) throw new Error(`Multiple Nevo pages are available; pass --target ID (${pages.map((page) => page.id).join(', ')})`)
    throw new Error(targetId ? `No Nevo page matches target ${targetId}` : 'No Nevo page found at localhost:1420 or 127.0.0.1:1420')
  }
  assertLoopbackUrl(selected.webSocketDebuggerUrl, ['ws:', 'wss:'])
  if (new URL(selected.webSocketDebuggerUrl).protocol !== 'ws:') throw new Error('Refusing secure or remote debugging WebSocket URL')
  return selected
}

export function assertQaMetadata(metadata) {
  const configPath = metadata?.configPath
  const components = typeof configPath === 'string' ? configPath.split(/[\\/]+/) : []
  if (!components.includes(QA_CONFIG_COMPONENT)) {
    throw new Error(`Refusing to operate on a non-isolated app; configPath must contain ${QA_CONFIG_COMPONENT}`)
  }
  return metadata
}

function viewportEntryKey(targetId, metadata) {
  assertQaMetadata(metadata)
  if (typeof targetId !== 'string' || targetId.length === 0) throw new Error('A CDP target id is required for viewport state')
  return JSON.stringify([targetId, metadata.configPath])
}

export function loadViewportOverride(statePath, targetId, metadata) {
  const key = viewportEntryKey(targetId, metadata)
  let state
  try { state = JSON.parse(readFileSync(statePath, 'utf8')) } catch (error) {
    if (error.code === 'ENOENT') return null
    throw new Error(`Unable to read QA viewport state: ${error.message}`)
  }
  if (state?.version !== 1 || !state.entries || typeof state.entries !== 'object' || Array.isArray(state.entries)) {
    throw new Error('QA viewport state has an unsupported format; remove .qa/windows/viewport.json to reset it')
  }
  const entry = state.entries[key]
  if (!entry) return null
  if (!Number.isInteger(entry.width) || !Number.isInteger(entry.height) || entry.width < 1 || entry.height < 1 || entry.width > 9999 || entry.height > 9999) {
    throw new Error('QA viewport state contains invalid dimensions')
  }
  return { width: entry.width, height: entry.height }
}

export function saveViewportOverride(statePath, targetId, metadata, dimensions) {
  const key = viewportEntryKey(targetId, metadata)
  if (!Number.isInteger(dimensions?.width) || !Number.isInteger(dimensions?.height) || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 9999 || dimensions.height > 9999) {
    throw new Error('QA viewport dimensions must be integers between 1 and 9999')
  }
  let state = { version: 1, entries: {} }
  try {
    state = JSON.parse(readFileSync(statePath, 'utf8'))
    if (state?.version !== 1 || !state.entries || typeof state.entries !== 'object' || Array.isArray(state.entries)) throw new Error('unsupported format')
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Unable to update QA viewport state: ${error.message}`)
  }
  state.entries[key] = { width: dimensions.width, height: dimensions.height }
  const temporaryPath = `${statePath}.${process.pid}.tmp`
  mkdirSync(dirname(statePath), { recursive: true })
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { flag: 'w' })
    renameSync(temporaryPath, statePath)
  } catch (error) {
    throw new Error(`Unable to save QA viewport state: ${error.message}`)
  }
}

export async function applyViewportOverride(connection, statePath, targetId, metadata) {
  const dimensions = loadViewportOverride(statePath, targetId, metadata)
  if (!dimensions) return null
  await connection.send('Emulation.setDeviceMetricsOverride', { ...dimensions, deviceScaleFactor: 1, mobile: false })
  return dimensions
}

export function buildKeyEvents(chord) {
  const modifiersByName = { Alt: 1, Control: 2, Meta: 4, Shift: 8 }
  const namedKeys = {
    Enter: ['Enter', 'Enter', 13], Escape: ['Escape', 'Escape', 27], Tab: ['Tab', 'Tab', 9],
    Backspace: ['Backspace', 'Backspace', 8], Delete: ['Delete', 'Delete', 46],
    ArrowDown: ['ArrowDown', 'ArrowDown', 40], ArrowUp: ['ArrowUp', 'ArrowUp', 38],
    ArrowLeft: ['ArrowLeft', 'ArrowLeft', 37], ArrowRight: ['ArrowRight', 'ArrowRight', 39],
    Home: ['Home', 'Home', 36], End: ['End', 'End', 35], Space: [' ', 'Space', 32],
  }
  const parts = chord.split('+')
  const key = parts.pop()
  const modifiers = parts.reduce((bits, name) => {
    if (!(name in modifiersByName)) throw new Error(`Unsupported modifier: ${name}`)
    return bits | modifiersByName[name]
  }, 0)
  const values = namedKeys[key] ?? (key?.length === 1 ? [key, `Key${key.toUpperCase()}`, key.toUpperCase().charCodeAt(0)] : null)
  if (!values) throw new Error(`Unsupported key: ${key ?? ''}`)
  const common = { key: values[0], code: values[1], windowsVirtualKeyCode: values[2], nativeVirtualKeyCode: values[2], modifiers }
  const namedOrModified = Boolean(modifiers) || Boolean(namedKeys[key])
  return [
    { type: namedOrModified ? 'rawKeyDown' : 'keyDown', ...common, ...(!namedOrModified && key.length === 1 ? { text: key, unmodifiedText: key } : {}) },
    { type: 'keyUp', ...common },
  ]
}

export class CDPConnection {
  constructor(socket, timeoutMs) {
    this.socket = socket
    this.timeoutMs = timeoutMs
    this.nextId = 1
    this.pending = new Map()
    socket.addEventListener('message', (event) => this.onMessage(event.data))
    socket.addEventListener('close', () => this.failAll(new Error('CDP connection closed')))
    socket.addEventListener('error', () => this.failAll(new Error('CDP connection error')))
  }

  static async connect(url, { WebSocketImpl = WebSocket, timeoutMs = 10_000 } = {}) {
    assertLoopbackUrl(url, ['ws:'])
    const socket = new WebSocketImpl(url)
    try {
      await new Promise((resolve, reject) => {
        let settled = false
        const cleanup = () => {
          clearTimeout(timer)
          socket.removeEventListener('open', onOpen)
          socket.removeEventListener('error', onError)
          socket.removeEventListener('close', onClose)
        }
        const finish = (error) => {
          if (settled) return
          settled = true
          cleanup()
          if (error) reject(error)
          else resolve()
        }
        const onOpen = () => finish()
        const onError = () => finish(new Error('Unable to connect to CDP WebSocket'))
        const onClose = () => finish(new Error('CDP WebSocket closed before opening'))
        const timer = setTimeout(() => finish(new Error('CDP WebSocket connection timed out')), timeoutMs)
        socket.addEventListener('open', onOpen)
        socket.addEventListener('error', onError)
        socket.addEventListener('close', onClose)
      })
    } catch (error) {
      try { socket.close() } catch {}
      throw error
    }
    return new CDPConnection(socket, timeoutMs)
  }

  onMessage(raw) {
    let message
    try { message = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) } catch { return }
    const pending = this.pending.get(message.id)
    if (!pending) return
    clearTimeout(pending.timer)
    this.pending.delete(message.id)
    if (message.error) pending.reject(new Error(`CDP ${pending.method}: ${message.error.message ?? 'protocol error'}`))
    else pending.resolve(message.result)
  }

  send(method, params = {}) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP ${method} timed out after ${this.timeoutMs} ms`))
      }, this.timeoutMs)
      this.pending.set(id, { method, resolve, reject, timer })
      try { this.socket.send(JSON.stringify({ id, method, params })) } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error)
      }
    })
  }

  failAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  close() {
    this.failAll(new Error('CDP connection closed'))
    this.socket.close()
  }
}

export async function connectToPage(port, targetId, { fetchImpl = fetch, WebSocketImpl = WebSocket, timeoutMs = 10_000 } = {}) {
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('Port must be between 1 and 65535')
  const endpoint = `http://127.0.0.1:${Number(port)}/json/list`
  const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(timeoutMs), redirect: 'error' })
  if (!response.ok) throw new Error(`CDP target list returned HTTP ${response.status}`)
  const target = findTarget(await response.json(), targetId)
  const connection = await CDPConnection.connect(target.webSocketDebuggerUrl, { WebSocketImpl, timeoutMs })
  return { target, connection }
}

export async function getQaMetadata(connection) {
  const { result, exceptionDetails } = await connection.send('Runtime.evaluate', {
    expression: `(() => { if (!window.__TAURI_INTERNALS__?.invoke) throw new Error('Tauri internals unavailable'); return window.__TAURI_INTERNALS__.invoke('get_app_metadata') })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'Unable to read Tauri app metadata')
  return assertQaMetadata(result?.value)
}
