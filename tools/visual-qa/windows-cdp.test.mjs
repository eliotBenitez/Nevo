import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CDPConnection, connectToPage, findTarget, assertQaMetadata, buildKeyEvents, loadViewportOverride, saveViewportOverride, applyViewportOverride } from './windows-cdp.mjs'

class FakeSocket {
  static instances = []
  constructor(url) {
    this.url = url
    this.listeners = new Map()
    this.sent = []
    FakeSocket.instances.push(this)
    queueMicrotask(() => this.emit('open', {}))
  }
  addEventListener(name, fn) {
    const items = this.listeners.get(name) ?? []
    items.push(fn)
    this.listeners.set(name, items)
  }
  removeEventListener(name, fn) {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((listener) => listener !== fn))
  }
  emit(name, event) {
    for (const fn of this.listeners.get(name) ?? []) fn(event)
  }
  send(text) { this.sent.push(JSON.parse(text)) }
  close() { this.emit('close', {}) }
  respond(id, result) { this.emit('message', { data: JSON.stringify({ id, result }) }) }
}

test('CDP matches out-of-order responses to their request ids', async () => {
  FakeSocket.instances = []
  const connection = await CDPConnection.connect('ws://127.0.0.1:9223/devtools/page/1', { WebSocketImpl: FakeSocket })
  const first = connection.send('Runtime.evaluate', { expression: '1' })
  const second = connection.send('Page.enable')
  const socket = FakeSocket.instances[0]
  socket.respond(2, { enabled: true })
  socket.respond(1, { result: { value: 1 } })
  assert.deepEqual(await Promise.all([first, second]), [{ result: { value: 1 } }, { enabled: true }])
  connection.close()
})

test('CDP rejects protocol errors, times out, and rejects pending requests on close', async () => {
  FakeSocket.instances = []
  const connection = await CDPConnection.connect('ws://127.0.0.1:9223/devtools/page/1', { WebSocketImpl: FakeSocket, timeoutMs: 15 })
  const errorRequest = connection.send('Bad.method')
  FakeSocket.instances[0].emit('message', { data: JSON.stringify({ id: 1, error: { message: 'nope' } }) })
  await assert.rejects(errorRequest, /nope/)
  await assert.rejects(connection.send('Never.responds'), /timed out/)
  const pending = connection.send('Pending')
  connection.close()
  await assert.rejects(pending, /closed/)
})

test('target selection ignores DevTools and requires explicit id for multiple app pages', () => {
  const pages = [
    { id: 'tools', type: 'page', url: 'devtools://devtools/bundled/inspector.html' },
    { id: 'a', type: 'page', url: 'http://localhost:1420/#/', webSocketDebuggerUrl: 'ws://127.0.0.1:9223/devtools/page/a' },
    { id: 'b', type: 'page', url: 'http://127.0.0.1:1420/#/settings', webSocketDebuggerUrl: 'ws://127.0.0.1:9223/devtools/page/b' },
  ]
  assert.throws(() => findTarget(pages), /Multiple/)
  assert.equal(findTarget(pages, 'b').id, 'b')
  assert.throws(() => findTarget([{ id: 'remote', type: 'page', url: 'http://localhost:1420', webSocketDebuggerUrl: 'ws://192.168.1.5:9223/devtools/page/remote' }]), /loopback/)
})

test('QA metadata guard requires the isolated config path component', () => {
  assert.equal(assertQaMetadata({ configPath: 'C:\\Users\\me\\AppData\\com.eliotBenitezhvat.nevo.qa\\config.json' }).configPath.includes('.qa'), true)
  assert.throws(() => assertQaMetadata({ configPath: 'C:\\Users\\me\\AppData\\com.eliotBenitezhvat.nevo\\config.json' }), /non-isolated app/)
})

test('connectToPage fetches only from loopback and connects the selected page', async () => {
  FakeSocket.instances = []
  let requested
  const { target } = await connectToPage(9223, 'qa-page', {
    WebSocketImpl: FakeSocket,
    fetchImpl: async (url, options) => {
      requested = url
      assert.equal(options.redirect, 'error')
      return { ok: true, json: async () => [{ id: 'qa-page', type: 'page', url: 'http://localhost:1420/', webSocketDebuggerUrl: 'ws://127.0.0.1:9223/devtools/page/qa-page' }] }
    },
  })
  assert.equal(requested, 'http://127.0.0.1:9223/json/list')
  assert.equal(target.id, 'qa-page')
  assert.equal(FakeSocket.instances[0].url, target.webSocketDebuggerUrl)
  FakeSocket.instances[0].close()
  await assert.rejects(connectToPage(9223, undefined, {
    fetchImpl: async () => ({ ok: true, json: async () => [{ id: 'bad', type: 'page', url: 'http://localhost:1420/', webSocketDebuggerUrl: 'ws://192.168.1.5:9223/devtools/page/bad' }] }),
  }), /loopback/)
})

test('connection timeout closes unopened socket and removes temporary listeners', async () => {
  class TimeoutSocket {
    static latest
    constructor(url) { this.url = url; this.listeners = new Map(); this.closed = false; TimeoutSocket.latest = this }
    addEventListener(name, fn) { const xs = this.listeners.get(name) ?? []; xs.push(fn); this.listeners.set(name, xs) }
    removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) ?? []).filter((item) => item !== fn)) }
    close() { this.closed = true }
  }
  await assert.rejects(CDPConnection.connect('ws://127.0.0.1:9223/devtools/page/1', { WebSocketImpl: TimeoutSocket, timeoutMs: 5 }), /timed out/)
  assert.equal(TimeoutSocket.latest.closed, true)
  assert.equal([...TimeoutSocket.latest.listeners.values()].flat().length, 0)
})

test('connection errors close unopened socket and remove temporary listeners', async () => {
  class ErrorSocket {
    static latest
    constructor() { this.listeners = new Map(); this.closed = false; ErrorSocket.latest = this; queueMicrotask(() => this.emit('error')) }
    addEventListener(name, fn) { const xs = this.listeners.get(name) ?? []; xs.push(fn); this.listeners.set(name, xs) }
    removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) ?? []).filter((item) => item !== fn)) }
    emit(name) { for (const fn of this.listeners.get(name) ?? []) fn({}) }
    close() { this.closed = true }
  }
  await assert.rejects(CDPConnection.connect('ws://127.0.0.1:9223/devtools/page/1', { WebSocketImpl: ErrorSocket }), /Unable to connect/)
  assert.equal(ErrorSocket.latest.closed, true)
  assert.equal([...ErrorSocket.latest.listeners.values()].flat().length, 0)
})

test('key event builder avoids text for shortcuts and keyup while preserving printable input', () => {
  const shortcut = buildKeyEvents('Control+a')
  assert.deepEqual(shortcut.map(({ type }) => type), ['rawKeyDown', 'keyUp'])
  assert.deepEqual(shortcut.map(({ key, code, windowsVirtualKeyCode, modifiers, text }) => ({ key, code, windowsVirtualKeyCode, modifiers, text })), [
    { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2, text: undefined },
    { key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2, text: undefined },
  ])
  const enter = buildKeyEvents('Enter')
  assert.equal(enter[0].type, 'rawKeyDown')
  assert.equal(enter[0].windowsVirtualKeyCode, 13)
  const tab = buildKeyEvents('Tab')
  assert.equal(tab[0].type, 'rawKeyDown')
  assert.equal(tab[0].windowsVirtualKeyCode, 9)
  const letter = buildKeyEvents('x')
  assert.equal(letter[0].type, 'keyDown')
  assert.equal(letter[0].text, 'x')
  assert.equal('text' in letter[1], false)
})

test('viewport override persists between CDP connections and is scoped to target plus QA config path', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nevo-windows-qa-'))
  const stateFile = join(directory, 'viewport.json')
  const metadata = { configPath: 'C:\\Users\\me\\AppData\\com.eliotBenitezhvat.nevo.qa\\config.json' }
  try {
    assert.equal(loadViewportOverride(stateFile, 'qa-target', metadata), null)
    saveViewportOverride(stateFile, 'qa-target', metadata, { width: 1280, height: 720 })
    const newConnectionCommands = []
    await applyViewportOverride({ send: async (...args) => newConnectionCommands.push(args) }, stateFile, 'qa-target', metadata)
    assert.deepEqual(newConnectionCommands, [['Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }]])
    saveViewportOverride(stateFile, 'qa-target', metadata, { width: 1440, height: 900 })
    assert.deepEqual(loadViewportOverride(stateFile, 'qa-target', metadata), { width: 1440, height: 900 })
    assert.equal(loadViewportOverride(stateFile, 'another-target', metadata), null)
    assert.equal(loadViewportOverride(stateFile, 'qa-target', { configPath: 'D:\\isolated\\com.eliotBenitezhvat.nevo.qa\\config.json' }), null)
    assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).version, 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
